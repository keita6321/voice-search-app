#!/usr/bin/env node
// X投稿の下書き生成スクリプト（ANIME CAST NOW）
// 使い方: node scripts/generate-posts.mjs [オプション]   ※依存パッケージなし / Node 18+
//
//   --data <path>        data.json のパス（既定: ./data.json）
//   --days <n>           何日分つくるか（既定: 28＝4週間）
//   --per-day <1|2>      1日の声優紹介の件数（既定: 1）
//   --start <YYYY-MM-DD> 開始日（既定: 明日）
//   --times <HH:MM,...>  投稿時刻（既定: 21:30,12:10）※1件目/2件目の順
//   --mode <popular|random> 声優の選び方（既定: popular＝出演本数が多い順）
//   --ranking-day <n>    週1回の「ランキング／データ小ネタ／開発ログ」を入れる起点の日（1始まり、既定: 3、0で無し）
//   --season-tag <tag>   季節ハッシュタグ（既定: 秋アニメ）
//   --base <url>         サイトURL（既定: https://anime-cast-now.vercel.app）
//   --link-style <utm|ref> リンクの計測パラメータ形式（既定: utm＝GA4向け）
//   --campaign <name>    utm_campaign の値（既定: x_posts。クールごとに変えると便利 例: 2026autumn）
//   --utm-source <name>  utm_source の値（既定: x）
//   --ref <value>        （--link-style ref のとき）?ref= の値（既定: x）
//   --out <dir>          出力先（既定: ./posts-out）
//   --history <path>     紹介済み声優の記録（既定: ./scripts/.post-history.json）
//   --no-history         記録を読み書きしない（毎回同じ顔ぶれになる）
//   --inspect            data.json の読み取り結果だけ表示して終了
//   --verify-pages       声優紹介先の個別ページが存在するか確認
//   --seed <n>           文面パターンの乱数シード（既定: 日付から）
import fs from 'node:fs';
import path from 'node:path';

// ───────── 引数 ─────────
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const nxt = argv[i + 1];
  if (nxt === undefined || nxt.startsWith('--')) opt[k] = true;
  else { opt[k] = nxt; i++; }
}
const CFG = {
  data: opt.data || 'data.json',
  days: Number(opt.days || 28),
  perDay: Math.min(2, Math.max(1, Number(opt['per-day'] || 1))),
  start: opt.start || null,
  times: String(opt.times || '21:30,12:10').split(','),
  mode: opt.mode === 'random' ? 'random' : 'popular',
  rankingDay: opt['ranking-day'] === undefined ? 3 : Number(opt['ranking-day']),
  seasonTag: String(opt['season-tag'] || '秋アニメ').replace(/^#/, ''),
  base: String(opt.base || 'https://anime-cast-now.vercel.app').replace(/\/$/, ''),
  ref: String(opt.ref || 'x'),
  linkStyle: opt['link-style'] === 'ref' ? 'ref' : 'utm',
  campaign: String(opt.campaign || 'x_posts'),
  utmSource: String(opt['utm-source'] || 'x'),
  out: opt.out || 'posts-out',
  history: opt['no-history'] ? null : (opt.history || 'scripts/.post-history.json'),
  inspect: !!opt.inspect,
  verifyPages: !!opt['verify-pages'],
};

// ───────── data.json の読み取り（スキーマ違いに強い版） ─────────
// うまく読めない場合は、下の MAP に自分のフィールド名を足してください。
const MAP = {
  vaList:   ['voiceActors', 'voice_actors', 'actors', 'vas', 'people', 'performers', 'seiyuu', 'items', 'data'],
  workList: ['works', 'animes', 'anime', 'titles', 'shows', 'programs', 'items', 'data'],
  id:       ['id', 'vaId', 'va_id', 'actorId', 'actor_id', 'slug', 'key'],
  name:     ['name', 'actor', 'actorName', 'va', 'vaName', 'voiceActor', 'voice_actor', 'cv', 'seiyuu', '名前'],
  works:    ['works', 'appearances', 'credits', 'roles', 'cast', 'shows', 'anime', 'titles', 'programs', 'work_ids', 'workIds'],
  cast:     ['cast', 'casts', 'characters', 'voiceActors', 'voice_actors', 'actors', 'vas'],
  title:    ['title', 'workTitle', 'work_title', 'animeTitle', 'name', 'titleJa', 'work', 'anime'],
  role:     ['role', 'character', 'characterName', 'roleName'],
};
const WORK_REF = ['workId', 'work_id', 'wid', 'work', 'annictId', 'annict_id', 'id'];
const WORKS_BY_ID = new Map();
const pick = (o, keys) => {
  if (o && typeof o === 'object') for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return undefined;
};
const asText = (v) => (v == null ? '' : typeof v === 'object' ? String(pick(v, MAP.name) ?? '') : String(v)).trim();
const isObjArray = (v) => Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] !== null;

function findArrays(data) {
  if (isObjArray(data)) return [['(root)', data]];
  const out = [];
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (isObjArray(v)) out.push([k, v]);
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const vals = Object.entries(v);
        if (vals.length && vals.every(([, x]) => x && typeof x === 'object' && !Array.isArray(x)))
          out.push([k, vals.map(([kk, x]) => ({ id: kk, ...x }))]); // {"va0036": {...}} 形式
      }
    }
  }
  return out;
}
const refTitle = (ref) => { const w = WORKS_BY_ID.get(String(ref)); return w ? asText(pick(w, MAP.title)) : ''; };
const toWork = (w) => {
  if (typeof w === 'string') return { title: refTitle(w) || w.trim(), role: '' };   // 作品ID or 作品名
  let title = asText(pick(w, MAP.title));
  if (!title || WORKS_BY_ID.has(title)) {                                       // 作品IDで参照している形式
    for (const k of WORK_REF) { const t = w[k] != null ? refTitle(w[k]) : ''; if (t) { title = t; break; } }
  }
  return { title, role: asText(pick(w, MAP.role)) };
};
// 配列でも、{"作品ID": {...}} のオブジェクトでも、作品リストとして受け取る
const toList = (x) => Array.isArray(x) ? x
  : (x && typeof x === 'object' ? Object.entries(x).map(([k, v]) => (v && typeof v === 'object' ? { id: k, ...v } : { id: k, role: String(v) })) : []);
const hasList = (x) => (Array.isArray(x) && x.length) || (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length);

function normalize(data) {
  const arrays = findArrays(data);
  // A) 声優が主：各声優が works 的な配列を持つ
  for (const [, arr] of arrays) {
    const hasWorks = arr.slice(0, 20).some((o) => MAP.works.some((k) => hasList(o[k])));
    if (hasWorks && arr.some((o) => pick(o, MAP.name))) {
      return { shape: 'voice-actor-centric', list: arr.map((o) => {
        const wk = toList(MAP.works.map((k) => o[k]).find((x) => hasList(x)));
        const seen = new Set();
        const works = wk.map(toWork).filter((w) => w.title && !seen.has(w.title) && seen.add(w.title));
        return { id: pick(o, MAP.id), name: asText(pick(o, MAP.name)), works };
      }) };
    }
  }
  // B) 作品が主：各作品が cast 的な配列を持つ
  for (const [, arr] of arrays) {
    const hasCast = arr.slice(0, 20).some((o) => MAP.cast.some((k) => Array.isArray(o[k]) && o[k].length));
    if (hasCast) {
      const byId = new Map();
      for (const w of arr) {
        const title = asText(pick(w, MAP.title));
        const cast = MAP.cast.map((k) => w[k]).find((x) => Array.isArray(x)) || [];
        for (const c of cast) {
          const id = pick(c, ['vaId', 'va_id', 'actorId', 'actor_id', 'personId', 'id']);
          const name = asText(pick(c, ['va', 'actor', 'actorName', 'voiceActor', 'cv', 'name']));
          if (!name) continue;
          const key = id ?? name;
          if (!byId.has(key)) byId.set(key, { id, name, works: [] });
          const role = asText(pick(c, ['role', 'character', 'characterName', 'roleName']));
          if (title && !byId.get(key).works.some((x) => x.title === title)) byId.get(key).works.push({ title, role });
        }
      }
      return { shape: 'work-centric', list: [...byId.values()] };
    }
  }
  return null;
}

// ───────── ユーティリティ ─────────
// URL用ID：generate-pages.mjs と同じ変換（先頭の "va" を除く）
const idToPath = (id) => {
  const actorId = String(id);
  if (!actorId.startsWith('va') || !/^[a-zA-Z0-9_-]+$/.test(actorId.slice(2))) {
    throw new Error(`Invalid voice actor ID: ${actorId}`);
  }
  return actorId.slice(2);
};
// Xの文字数（日本語は1文字=2、URLは23）
function weightedLength(text) {
  const t = text.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
  let n = 0;
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    const w1 = cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037);
    n += w1 ? 1 : 2;
  }
  return n;
}
const hashtag = (name) => '#' + name.replace(/[\s\u3000・･·.\-–—'’"“”!！?？,，、。]/g, '');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const q = (s) => `「${clip(s, 16)}」`;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ───────── 文面テンプレート ─────────
// 計測パラメータ付きURL。utm_content で投稿の種類（声優ID／ranking／devlog）を見分ける
const link = (p, content) => CFG.linkStyle === 'ref'
  ? `${CFG.base}${p}?ref=${CFG.ref}`
  : `${CFG.base}${p}?utm_source=${encodeURIComponent(CFG.utmSource)}&utm_medium=social&utm_campaign=${encodeURIComponent(CFG.campaign)}&utm_content=${encodeURIComponent(content)}`;
const urlOf = (v) => link(`/va/${idToPath(v.id)}/`, `va${idToPath(v.id)}`);
const TEMPLATES = [
  (v, t) => `${v.name}さんは、今期${v.works.length}作品に出演！\n${t.join('')}${v.works.length > t.length ? 'ほか、' : 'の'}配信先もまとめて確認できます👇\n${urlOf(v)}\n${hashtag(v.name)} #${CFG.seasonTag}`,
  (v, t) => `${v.name}さんの今期の出演作はこちら！\n${v.works.length}作品に出演中です。${t.join('')}${v.works.length > t.length ? 'など' : ''}👇\n${urlOf(v)}\n${hashtag(v.name)} #${CFG.seasonTag}`,
  (v, t) => `「${v.name}さん、今期なにに出てる？」\n→ ${v.works.length}作品に出演中！ ${t.join('')}${v.works.length > t.length ? 'など' : ''}\n配信先もひと目で分かります👇\n${urlOf(v)}\n${hashtag(v.name)} #${CFG.seasonTag}`,
  (v, t) => `今期の${v.name}さんをチェック🎙\n出演は${v.works.length}作品。${t.join('')}${v.works.length > t.length ? 'など' : ''}\n見られるVODもまとめました👇\n${urlOf(v)}\n${hashtag(v.name)} #${CFG.seasonTag}`,
];
const TEMPLATES_SINGLE = [
  (v, t) => `${v.name}さんは、今期${t[0]}に出演！\n配信先もまとめて確認できます👇\n${urlOf(v)}\n${hashtag(v.name)} #${CFG.seasonTag}`,
  (v, t) => `${v.name}さんの今期の出演作は${t[0]}！\n見られるVODはこちら👇\n${urlOf(v)}\n${hashtag(v.name)} #${CFG.seasonTag}`,
];
function buildIntro(v, rnd) {
  const pool = v.works.length === 1 ? TEMPLATES_SINGLE : TEMPLATES;
  const start = Math.floor(rnd() * pool.length);
  for (let k = 0; k < pool.length; k++) {
    const tpl = pool[(start + k) % pool.length];
    for (const nTitles of [2, 1]) {           // 文字数オーバーなら作品名を減らす
      const titles = v.works.slice(0, v.works.length === 1 ? 1 : nTitles).map((w) => q(w.title));
      const text = tpl(v, titles);
      if (weightedLength(text) <= 280) return text;
    }
  }
  return pool[0](v, []).replace(/・?ほか、?/, '');
}
function buildRanking(vas, from = 0) {
  const sorted = [...vas].sort((a, b) => b.works.length - a.works.length || String(a.id).localeCompare(String(b.id)));
  for (const n of [5, 3]) {
    const top = sorted.slice(from, from + n);
    if (!top.length) return null;
    const lines = top.map((v) => {
      const rank = 1 + sorted.filter((x) => x.works.length > v.works.length).length;
      return `${rank}位 ${v.name}さん（${v.works.length}作品）`;
    });
    const title = from === 0 ? '【今期の出演本数ランキング】' : `【今期の出演本数ランキング｜${from + 1}〜${from + top.length}番目】`;
    const text = `${title}\n${lines.join('\n')}\n\n声優名で検索すると、出演作と配信先が分かります👇\n${link('/', 'ranking')}\n#${CFG.seasonTag} #声優`;
    if (weightedLength(text) <= 280) return text;
  }
  return null;
}
function buildStats(vas) {
  const titles = new Set(vas.flatMap((v) => v.works.map((w) => w.title)));
  const n3 = vas.filter((v) => v.works.length >= 3).length;
  const text = `【今期のアニメ声優データ】\n声優${vas.length}名・${titles.size}作品を収録！\n3作品以上に出演中の声優は${n3}名。\n声優名で検索すると、出演作と配信先が分かります👇\n${link('/', 'stats')}\n#${CFG.seasonTag} #声優`;
  return weightedLength(text) <= 280 ? text : null;
}
const DEV_LOG = `声優検索サービス「ANIME CAST NOW」を作っています。\n今週やったこと：（ここに記入）\n${link('/', 'devlog')}\n#個人開発`;

// ───────── 実行 ─────────
let raw;
try { raw = JSON.parse(fs.readFileSync(CFG.data, 'utf8')); }
catch (e) { console.error(`data.json を読めませんでした: ${CFG.data}\n${e.message}`); process.exit(1); }

// 作品辞書（作品ID → 作品）を先に作る
{
  const w = raw && raw.works;
  if (w && typeof w === 'object') for (const [k, v] of Object.entries(w)) { const o = Array.isArray(w) ? v : v; const id = Array.isArray(w) ? (v && v.id) : k; if (id != null) WORKS_BY_ID.set(String(id), o); }
}
const norm = normalize(raw);
if (!norm) {
  console.error('data.json の構造を判別できませんでした。トップレベルの構造:');
  for (const [k, v] of Object.entries(raw)) {
    const kind = Array.isArray(v) ? `配列(${v.length})` : v && typeof v === 'object' ? `オブジェクト(${Object.keys(v).length})` : typeof v;
    const first = Array.isArray(v) ? v[0] : v && typeof v === 'object' ? Object.values(v)[0] : null;
    console.error(`  ${k}: ${kind}${first && typeof first === 'object' ? ' 先頭の中身: ' + JSON.stringify(first).slice(0, 220) : ''}`);
  }
  console.error('→ scripts/generate-posts.mjs 冒頭の MAP に、フィールド名を追加してください。');
  process.exit(1);
}
const missingId = norm.list.filter((v) => v.id == null || v.id === '').length;
const vas = norm.list.filter((v) => v.name && v.works.length && v.id != null && v.id !== '');
console.log(`読み取り: ${norm.shape} / 声優 ${vas.length}名（IDなし等で除外 ${norm.list.length - vas.length}名${missingId ? '、うちIDなし ' + missingId : ''}）`);
if (CFG.inspect || !vas.length) {
  for (const v of vas.slice(0, 3)) console.log(' ', v.id, v.name, v.works.length + '作品', v.works.slice(0, 2).map((w) => w.title));
  if (!vas.length) console.error('投稿対象の声優が0名です。MAP のフィールド名を確認してください。');
  process.exit(vas.length ? 0 : 1);
}

let history = { used: [] };
if (CFG.history && fs.existsSync(CFG.history)) { try { history = JSON.parse(fs.readFileSync(CFG.history, 'utf8')); } catch {} }
const used = new Set(history.used.map(String));
let pool = vas.filter((v) => !used.has(String(v.id)));
let recycled = false;
if (CFG.history && pool.length < CFG.days * CFG.perDay) { recycled = true; pool = [...vas]; history.used = []; }

const startDate = CFG.start ? new Date(CFG.start + 'T00:00:00') : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d; })();
const rnd = mulberry32(Number(opt.seed ?? Number(ymd(startDate).replace(/-/g, ''))));
if (CFG.mode === 'random') pool.sort(() => rnd() - 0.5);
else pool.sort((a, b) => b.works.length - a.works.length || String(a.id).localeCompare(String(b.id)));

const rows = [];
let cursor = 0;
// 声優紹介と同じ時刻にならないよう、別枠の時刻を使う
const extraTime = CFG.perDay === 1 ? (CFG.times[1] || '12:10') : '18:30';
for (let d = 0; d < CFG.days; d++) {
  const date = new Date(startDate); date.setDate(date.getDate() + d);
  for (let s = 0; s < CFG.perDay; s++) {
    const v = pool[cursor++]; if (!v) break;
    rows.push({ date: ymd(date), time: CFG.times[s] || '21:30', type: '声優紹介', va: `${v.name}(${v.id})`, vaName: v.name, vaId: String(v.id), text: buildIntro(v, rnd) });
    history.used.push(String(v.id));
  }
  // 週1回の枠（ranking-day から7日ごと）：ランキング → データ小ネタ → ランキング(6〜10番目) → 開発ログ（手動）
  if (CFG.rankingDay && d + 1 >= CFG.rankingDay && (d + 1 - CFG.rankingDay) % 7 === 0) {
    const k = ((d + 1 - CFG.rankingDay) / 7) % 4;
    const slot = [
      () => ({ type: 'ランキング', text: buildRanking(vas, 0) }),
      () => ({ type: 'データ小ネタ', text: buildStats(vas) }),
      () => ({ type: 'ランキング（6〜10番目）', text: buildRanking(vas, 5) }),
      () => ({ type: '開発ログ（手動で記入）', text: DEV_LOG }),
    ][k]();
    if (slot.text) rows.push({ date: ymd(date), time: extraTime, type: slot.type, va: '', text: slot.text });
  }
}
if (CFG.verifyPages) {
  const pageDirectory = path.resolve('va');
  if (!fs.existsSync(pageDirectory) || !fs.statSync(pageDirectory).isDirectory()) {
    console.warn('⚠ 個別ページが見つかりません。先に `npm run build:pages` を実行してください。');
  }
  for (const row of rows) {
    if (!row.vaId) continue;
    const pageId = idToPath(row.vaId);
    const expectedPath = path.posix.join('va', pageId, 'index.html');
    row.pageMissing = !fs.existsSync(path.join(pageDirectory, pageId, 'index.html'));
    if (row.pageMissing) {
      console.warn(`⚠ ${row.vaName}（${row.vaId}）: 個別ページが見つかりません（${expectedPath}）`);
    }
  }
}
rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
rows.forEach((r) => { r.len = weightedLength(r.text); });

fs.mkdirSync(CFG.out, { recursive: true });
const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csvHeader = ['日付,時刻,種類,声優,本文,文字数(上限280)', ...(CFG.verifyPages ? ['ページなし'] : [])].join(',');
const csv = '\uFEFF' + [csvHeader, ...rows.map((r) => [...[r.date, r.time, r.type, r.va, r.text, r.len], ...(CFG.verifyPages ? [r.pageMissing ? 'ページなし' : ''] : [])].map(esc).join(','))].join('\r\n');
fs.writeFileSync(path.join(CFG.out, 'posts.csv'), csv);
const md = rows.map((r) => `### ${r.date} ${r.time}｜${r.type}${r.va ? `｜${r.va}` : ''}（${r.len}/280）\n\n\`\`\`\n${r.text}\n\`\`\`\n`).join('\n');
fs.writeFileSync(path.join(CFG.out, 'posts.md'), `# 投稿下書き（${rows[0]?.date} 〜）\n\n※投稿前に、URLを貼ってカードが出るか確認してください。\n\n${md}`);


// ───────── 貼り付け補助ページ（posts-helper.html） ─────────
const fnv = (str) => { let h = 0x811c9dc5; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const helperRows = rows.map((r) => ({ ...r, ...(CFG.verifyPages ? { pageMissing: !!r.pageMissing } : {}), id: fnv(`${r.date}|${r.time}|${r.text}`) }));
const helperHtml = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>投稿の予約｜貼り付け補助</title>
<style>
:root{color-scheme:light dark;--bg:#f8f7f2;--card:#fff;--ink:#1b2a4a;--sub:#6b6880;--line:#e3dfd2;--accent:#6b5b8c;--ok:#1f9d63}
@media (prefers-color-scheme:dark){:root{--bg:#141c36;--card:#1d2748;--ink:#f1efff;--sub:#a9a4c9;--line:#2f3a63;--accent:#b9a6ff;--ok:#4fd195}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 16px;z-index:2}
h1{font-size:18px;margin:0 0 4px}.hint{color:var(--sub);font-size:13px;margin:0}
.bar{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:14px}
main{max-width:820px;margin:0 auto;padding:12px 16px 80px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
.card.done{opacity:.45}
.meta{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}
.when{font-weight:800;font-size:18px}.tag{font-size:12px;background:var(--accent);color:#fff;border-radius:999px;padding:1px 10px}
.len{color:var(--sub);font-size:12px;margin-left:auto}.len.over{color:#d64545;font-weight:700}
pre{white-space:pre-wrap;word-break:break-word;font:inherit;margin:0 0 10px;padding:10px 12px;background:var(--bg);border-radius:10px}
.btns{display:flex;gap:8px;flex-wrap:wrap}
button,a.btn{font:inherit;font-weight:700;border:1.5px solid var(--accent);color:var(--accent);background:transparent;border-radius:999px;padding:7px 16px;cursor:pointer;text-decoration:none;min-height:40px;display:inline-flex;align-items:center}
button.primary{background:var(--accent);color:#fff}button.donebtn.on{border-color:var(--ok);background:var(--ok);color:#fff}
.page-warning{margin:0 0 10px;color:#d64545;font-weight:800}
</style></head><body>
<header>
  <h1>投稿の予約｜貼り付け補助</h1>
  <p class="hint">PCのブラウザでXを開く → 投稿画面の「カレンダーのアイコン」→ 日時を選ぶ → 本文を貼り付けて「予約設定」。予約できたら「予約済み」を押します。</p>
  <div class="bar"><strong id="prog"></strong><label><input type="checkbox" id="onlyTodo"> 未予約だけ表示</label></div>
</header>
<main id="list"></main>
<script>
const ROWS = ${JSON.stringify(helperRows).replace(/</g, '\\u003c')};
const key = (r) => 'acn-post-' + r.id;
const get = (r) => { try { return localStorage.getItem(key(r)) === '1'; } catch { return false; } };
const set = (r, v) => { try { v ? localStorage.setItem(key(r), '1') : localStorage.removeItem(key(r)); } catch {} };
const wd = (d) => new Date(d + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  const o = btn.textContent; btn.textContent = 'コピーしました ✓'; setTimeout(() => (btn.textContent = o), 1200);
}
function render() {
  const only = document.getElementById('onlyTodo').checked;
  const list = document.getElementById('list'); list.innerHTML = '';
  let done = 0;
  for (const r of ROWS) {
    const d = get(r); if (d) done++;
    if (only && d) continue;
    const el = document.createElement('section'); el.className = 'card' + (d ? ' done' : '');
    const meta = document.createElement('div'); meta.className = 'meta';
    const when = document.createElement('span'); when.className = 'when'; when.textContent = wd(r.date) + ' ' + r.time;
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = r.type + (r.va ? '｜' + r.va : '');
    const len = document.createElement('span'); len.className = 'len' + (r.len > 280 ? ' over' : ''); len.textContent = r.len + '/280';
    meta.append(when, tag, len);
    const pre = document.createElement('pre'); pre.textContent = r.text;
    if (r.pageMissing) { const warning = document.createElement('p'); warning.className = 'page-warning'; warning.textContent = '個別ページが見つかりません'; el.append(warning); }
    const btns = document.createElement('div'); btns.className = 'btns';
    const c = document.createElement('button'); c.className = 'primary'; c.textContent = 'コピー'; c.onclick = () => copy(r.text, c);
    const x = document.createElement('a'); x.className = 'btn'; x.target = '_blank'; x.rel = 'noopener';
    x.href = 'https://x.com/intent/post?text=' + encodeURIComponent(r.text); x.textContent = 'Xで開く（本文入り）';
    const dn = document.createElement('button'); dn.className = 'donebtn' + (d ? ' on' : ''); dn.textContent = d ? '予約済み ✓' : '予約済みにする';
    dn.onclick = () => { set(r, !d); render(); };
    btns.append(c, x, dn);
    el.append(meta, pre, btns); list.append(el);
  }
  document.getElementById('prog').textContent = '予約済み ' + done + ' / ' + ROWS.length;
}
document.getElementById('onlyTodo').onchange = render; render();
</script></body></html>`;
fs.writeFileSync(path.join(CFG.out, 'posts-helper.html'), helperHtml);

if (CFG.history) { fs.mkdirSync(path.dirname(CFG.history), { recursive: true }); fs.writeFileSync(CFG.history, JSON.stringify(history, null, 2)); }
const over = rows.filter((r) => r.len > 280);
console.log(`${rows.length}件を出力: ${path.join(CFG.out, 'posts-helper.html')}（貼り付け補助）/ posts.csv / posts.md${recycled ? '（未紹介の声優が足りないため、履歴をリセットしました）' : ''}`);
if (over.length) console.warn(`⚠ 文字数オーバー ${over.length}件（手で調整してください）`);
