// X 運用ツール（/tools/x/）。オーナー専用のページで、検索には出さず、GA4 でも計測しない。
// - 引用ポストの文面メーカー：声優を選ぶと、今期の出演作数とリンク入りの文面ができる
// - 週のデータポスト：サイトのデータから文面と画像（canvas）を作る
// 画像はブラウザーで描くので、ビルドにブラウザーやフォントは要らない。

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 声優ページと同じ数え方：配信先のある作品だけ数える
function vodWorkIds(data, actor) {
  return [...new Set(actor.roles.filter(r => data.works[r.work_id]?.vod_links?.length).map(r => r.work_id))];
}

export function xToolsPayload({ data, next, castLog, seasonLabel, nextLabel }) {
  const actors = new Map();
  for (const actor of data.voice_actors) {
    const ids = vodWorkIds(data, actor);
    actors.set(actor.actor_id, {
      id: actor.actor_id.slice(2), name: actor.name, reading: actor.reading ?? '', n: ids.length,
      works: ids.slice(0, 3).map(id => data.works[id].title), next: [],
    });
  }
  for (const actor of next?.voice_actors ?? []) {
    if (!actors.has(actor.actor_id)) {
      actors.set(actor.actor_id, { id: actor.actor_id.slice(2), name: actor.name, reading: actor.reading ?? '', n: 0, works: [], next: [] });
    }
    const entry = actors.get(actor.actor_id);
    for (const role of actor.roles) {
      const work = next.works[role.work_id];
      if (work) entry.next.push({ t: work.title, c: role.character_name, w: role.work_id });
    }
  }
  const counts = new Map([...actors].map(([key, a]) => [key, a.n]));

  // 来期の作品ごとに、キャストの今期の出演作数（キャストの今期の出演が多い作品から）
  const nextWorks = Object.entries(next?.works ?? {}).map(([id, work]) => {
    const cast = [];
    for (const actor of next.voice_actors) {
      for (const role of actor.roles) {
        if (role.work_id === id) cast.push({ name: actor.name, c: role.character_name, n: counts.get(actor.actor_id) ?? 0 });
      }
    }
    cast.sort((a, b) => b.n - a.n);
    return { id, t: work.title, d: work.start_date ?? null, cast, sum: cast.reduce((s, x) => s + x.n, 0) };
  });
  const castWorks = nextWorks.filter(w => w.cast.filter(x => x.n > 0).length >= 2).sort((a, b) => b.sum - a.sum).slice(0, 8)
    .map(({ id, t, cast }) => ({ id, t, cast: cast.filter(x => x.n > 0).slice(0, 6) }));
  const schedule = nextWorks.filter(w => w.d).sort((a, b) => a.d.localeCompare(b.d) || a.t.localeCompare(b.t, 'ja')).map(({ id, t, d }) => ({ id, t, d }));

  // 同数は同順位（1, 2, 2, 2, 5…）。10人目で切り、同数の残りがいることはカードに書く
  const ranked = [...actors.values()].filter(a => a.n > 0).sort((a, b) => b.n - a.n || a.reading.localeCompare(b.reading, 'ja'));
  const top = ranked.slice(0, 10).map(({ id, name, n }) => ({ id, name, n, rank: 1 + ranked.filter(x => x.n > n).length }));

  const newCast = castLog?.season === next?.season ? (castLog?.entries ?? []).filter(e => next.works[e.work_id])
    .map(e => ({ date: e.date, w: e.work_id, t: next.works[e.work_id].title, c: e.character, name: e.name, id: e.actor_id.slice(2) })) : [];

  return {
    seasonLabel, nextLabel, updated: data.updated_at?.slice(0, 10),
    actors: [...actors.values()], top, castWorks, schedule, newCast,
  };
}

export function xToolsPage(ctx) {
  const payload = JSON.stringify(xToolsPayload(ctx)).replace(/</g, '\\u003c');
  const origin = ctx.origin;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>X 運用ツール｜ANIME CAST NOW</title>
<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
<style>
:root{--navy:#1d2a44;--ac:#62517f;--bg:#f6f3ec;--ln:#e3ddd0;--sub:#6b6860}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--navy);font-family:system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;line-height:1.6}
main{max-width:720px;margin:0 auto;padding:16px 16px 60px}
h1{font-size:20px;margin:8px 0 2px}h2{font-size:17px;margin:28px 0 6px;padding-top:14px;border-top:2px solid var(--ln)}h3{font-size:15px;margin:18px 0 6px}
.sub{color:var(--sub);font-size:13px;margin:0 0 8px}
.box{background:#fff;border:1px solid var(--ln);border-radius:14px;padding:14px;margin:10px 0}
input[type=search],input[type=url],input[type=text],textarea{width:100%;font:inherit;font-size:16px;border:1.5px solid #cfc8b8;border-radius:10px;padding:10px 12px;background:#fff;color:inherit}
textarea{min-height:170px;resize:vertical;line-height:1.55}
label{display:block;font-size:13px;font-weight:700;margin:12px 0 4px}
button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:0;border-radius:999px;background:var(--ac);color:#fff;font:inherit;font-weight:800;font-size:14px;text-decoration:none;cursor:pointer}
button.ghost,.btn.ghost{background:#efeaf6;color:#4b3d6b}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid #d8d0e4;background:#f5f2fa;color:#4b3d6b;font-weight:700;font-size:13px}
.chip small{margin-left:4px;font-weight:600;color:var(--sub)}
.count{font-size:12px;color:var(--sub)}.count.over{color:#b3261e;font-weight:800}
.picked{font-weight:800;font-size:16px}
.hint{font-size:12px;color:var(--sub);margin:4px 0 0}
canvas{width:100%;height:auto;border-radius:10px;display:block;margin-top:10px;background:var(--navy)}
.empty{color:var(--sub);font-size:14px}
ol.steps{padding-left:20px;font-size:14px;margin:6px 0}
</style>
</head>
<body>
<main>
<h1>X 運用ツール</h1>
<p class="sub">自分専用のページです（検索には出ません）。データは毎週月曜に更新されます。最終更新：<span id="updated"></span></p>
<div class="box">
<ol class="steps">
<li>毎日：引用ポストを3件（公式ポストの URL を貼って「X で開く」）</li>
<li>毎日：通知への返信・いいね</li>
<li>月曜：下の「週のデータポスト」を X の予約投稿に入れる</li>
</ol>
</div>

<h2>引用ポストの文面メーカー</h2>
<h3>今日の狙い目</h3>
<p class="sub">来期の出演が決まっていて、今期の出演作も多い声優です（日替わり）。</p>
<div class="chips" id="picks"></div>
<label for="q">声優名で探す（ひらがなでも可）</label>
<input id="q" type="search" placeholder="例：すぎた、松岡禎丞" autocomplete="off">
<div class="chips" id="results" style="margin-top:8px"></div>

<div class="box" id="composer" hidden>
<p class="picked" id="picked"></p>
<p class="sub" id="pickedInfo"></p>
<div class="chips" id="variants"></div>
<label for="text">文面（1行目に、公式ポストの話題への一言を足すと自然です）</label>
<textarea id="text"></textarea>
<label for="tags">ハッシュタグ（公式が使っているもの）</label>
<input id="tags" type="text" placeholder="例：#サカモトデイズ">
<label for="quote">公式ポストの URL（貼ると引用ポストになります）</label>
<input id="quote" type="url" placeholder="https://x.com/…/status/…">
<p class="count" id="count"></p>
<div class="row"><a class="btn" id="intent" href="#" target="_blank" rel="noopener">X で開く</a><button class="ghost" id="copy" type="button">文面をコピー</button></div>
<p class="hint">「X で開く」を押すと、文面と公式ポストが入った投稿画面が開きます。</p>
</div>

<h2>週のデータポスト</h2>
<p class="sub">文面をコピーし、画像を保存して、X の予約投稿に入れてください。スマホなら「共有」で画像と文面をそのまま X に送れます。</p>
<div id="cards"></div>
</main>
<script id="payload" type="application/json">${payload}</script>
<script>
(() => {
const P = JSON.parse(document.getElementById('payload').textContent);
const ORIGIN = ${JSON.stringify(origin)};
const $ = s => document.querySelector(s);
const utm = (path, campaign) => ORIGIN + path + '?utm_source=x&utm_medium=social&utm_campaign=' + campaign;
$('#updated').textContent = P.updated || '';

// ---- X の文字数（URL は 23、全角は 2 として数える。上限 280） ----
function weight(text) {
  let w = 0;
  const urlRe = /https?:\\/\\/\\S+/g;
  const rest = text.replace(urlRe, () => { w += 23; return ''; });
  for (const ch of rest) {
    const c = ch.codePointAt(0);
    w += (c <= 0x10FF || (c >= 0x2000 && c <= 0x200D) || (c >= 0x2010 && c <= 0x201F) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2;
  }
  return w;
}

// ---- 引用ポストの文面 ----
let current = null;
function variantsOf(a) {
  const url = utm('/va/' + a.id + '/', 'quote');
  const out = [];
  const works = a.works.slice(0, 2).join('、') + (a.n > 2 ? ' ほか' : '');
  if (a.n > 0) out.push(['今期の出演作', a.name + 'さんは今期' + a.n + '作品に出演中🎙\\n' + works + '\\n\\n出演作と配信先はこちら👇\\n' + url]);
  const nx = a.next[0];
  if (nx && a.n > 0) out.push(['来期の出演決定', a.name + 'さん、来期は「' + nx.t + '」の' + nx.c + '役！\\n今期は' + a.n + '作品に出演中なので、放送前にチェックできます📺\\n' + url]);
  if (nx && a.n === 0) out.push(['来期の出演決定', a.name + 'さん、来期は「' + nx.t + '」の' + nx.c + '役！\\n来期の出演予定と過去の代表作はこちら👇\\n' + url]);
  if (a.n > 0) out.push(['役名から', '〔キャラ名〕の声は' + a.name + 'さん🎙\\n今期は' + works + 'にも出演中（全' + a.n + '作品）\\n' + url]);
  return out;
}
function pick(a) {
  current = a;
  $('#composer').hidden = false;
  $('#picked').textContent = a.name;
  $('#pickedInfo').textContent = '今期 ' + a.n + '作品' + (a.next.length ? '／来期：' + a.next.map(x => x.t + '（' + x.c + '）').join('、') : '');
  const vs = variantsOf(a);
  const box = $('#variants'); box.innerHTML = '';
  vs.forEach(([label, text], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = label;
    b.onclick = () => { $('#text').value = text; update(); };
    box.appendChild(b);
    if (i === 0) $('#text').value = text;
  });
  update();
  $('#composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function fullText() {
  const tags = $('#tags').value.trim();
  return $('#text').value.trim() + (tags ? '\\n' + tags : '');
}
function update() {
  const text = fullText();
  const quote = $('#quote').value.trim();
  const w = weight(text + (quote ? '\\n' + quote : ''));
  const c = $('#count'); c.textContent = '文字数の目安：' + w + ' / 280'; c.className = 'count' + (w > 280 ? ' over' : '');
  $('#intent').href = 'https://x.com/intent/post?text=' + encodeURIComponent(text + (quote ? '\\n' + quote : ''));
}
['#text', '#tags', '#quote'].forEach(s => $(s).addEventListener('input', update));
$('#copy').onclick = async () => {
  try { await navigator.clipboard.writeText(fullText()); $('#copy').textContent = 'コピーしました'; }
  catch { $('#text').select(); document.execCommand('copy'); $('#copy').textContent = 'コピーしました'; }
  setTimeout(() => { $('#copy').textContent = '文面をコピー'; }, 1500);
};
function chip(a, box) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
  b.innerHTML = '';
  b.append(a.name);
  const s = document.createElement('small'); s.textContent = '今期' + a.n + (a.next.length ? '・来期あり' : ''); b.append(s);
  b.onclick = () => pick(a);
  box.appendChild(b);
}
// 今日の狙い目（日替わりで5人）
const strong = P.actors.filter(a => a.next.length && a.n >= 5);
const pool = (strong.length >= 10 ? strong : P.actors.filter(a => a.next.length && a.n >= 3)).sort((a, b) => b.n - a.n || a.reading.localeCompare(b.reading, 'ja'));
const day = Math.floor((Date.now() + 9 * 3600e3) / 864e5);
const picks = pool.length ? Array.from({ length: Math.min(5, pool.length) }, (_, i) => pool[(day * 5 + i) % pool.length]) : [];
picks.forEach(a => chip(a, $('#picks')));
if (!picks.length) $('#picks').innerHTML = '<p class="empty">来期の出演が決まっている声優がまだいません。</p>';
const kata = s => s.replace(/[\\u30a1-\\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = s => kata((s || '').normalize('NFKC').replace(/[\\s・]/g, '').toLowerCase());
$('#q').addEventListener('input', () => {
  const q = norm($('#q').value); const box = $('#results'); box.innerHTML = '';
  if (!q) return;
  P.actors.filter(a => norm(a.name).includes(q) || norm(a.reading).includes(q)).sort((a, b) => b.n - a.n).slice(0, 10).forEach(a => chip(a, box));
});

// ---- 週のデータポスト（文面＋画像） ----
const FONT = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif";
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
function drawCard(canvas, { kicker, title, rows, foot }) {
  const W = 1200, H = 675; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1d2a44'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f5c84b'; ctx.fillRect(0, 0, 14, H);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f5c84b'; ctx.font = '800 26px ' + FONT; ctx.fillText(kicker, 64, 72);
  ctx.fillStyle = '#ffffff'; ctx.font = '900 46px ' + FONT; ctx.fillText(fit(ctx, title, W - 128), 64, 132);
  const top = 178, rowH = Math.min(46, Math.floor((H - top - 70) / Math.max(rows.length, 1)));
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH * 0.72;
    if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(56, top + i * rowH, W - 112, rowH); }
    ctx.fillStyle = '#f5c84b'; ctx.font = '900 ' + Math.round(rowH * 0.56) + 'px ' + FONT;
    ctx.fillText(r.lead, 72, y);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 ' + Math.round(rowH * 0.56) + 'px ' + FONT;
    const rightW = r.right ? ctx.measureText(r.right).width : 0;
    ctx.fillText(fit(ctx, r.main, W - 72 - 150 - rightW - 90), 72 + 150, y);
    if (r.right) { ctx.fillStyle = '#c9c1dc'; ctx.textAlign = 'right'; ctx.fillText(r.right, W - 76, y); ctx.textAlign = 'left'; }
  });
  ctx.fillStyle = '#c9c1dc'; ctx.font = '700 22px ' + FONT; ctx.fillText(foot, 64, H - 34);
  ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = '800 24px ' + FONT; ctx.fillText('ANIME CAST NOW', W - 64, H - 34); ctx.textAlign = 'left';
}
function addCard({ name, text, card }) {
  const box = document.createElement('div'); box.className = 'box';
  const h = document.createElement('h3'); h.textContent = name; box.appendChild(h);
  const ta = document.createElement('textarea'); ta.value = text; box.appendChild(ta);
  const canvas = document.createElement('canvas'); box.appendChild(canvas);
  drawCard(canvas, card);
  const row = document.createElement('div'); row.className = 'row';
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'ghost'; copy.textContent = '文面をコピー';
  copy.onclick = async () => { try { await navigator.clipboard.writeText(ta.value); copy.textContent = 'コピーしました'; } catch { ta.select(); document.execCommand('copy'); copy.textContent = 'コピーしました'; } setTimeout(() => { copy.textContent = '文面をコピー'; }, 1500); };
  const save = document.createElement('button'); save.type = 'button'; save.className = 'ghost'; save.textContent = '画像を保存';
  const fileName = 'animecastnow-' + name.replace(/[^\\w\\u3040-\\u30ff\\u4e00-\\u9fff]+/g, '-') + '.png';
  save.onclick = () => canvas.toBlob(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
  row.append(copy, save);
  if (navigator.canShare) {
    const share = document.createElement('button'); share.type = 'button'; share.textContent = '共有（X に送る）';
    share.onclick = () => canvas.toBlob(async blob => {
      const file = new File([blob], fileName, { type: 'image/png' });
      const data = { files: [file], text: ta.value };
      if (navigator.canShare(data)) { try { await navigator.share(data); } catch {} } else { save.click(); }
    });
    row.prepend(share);
  }
  box.appendChild(row);
  $('#cards').appendChild(box);
}
const weekOf = Math.floor(day / 7);

// 1) 今期の出演作が多い声優 TOP10
if (P.top.length) {
  const lines = P.top.slice(0, 3).map(a => a.rank + '位 ' + a.name + '（' + a.n + '作品）').join('\\n');
  addCard({
    name: '今期の出演作が多い声優 TOP10',
    text: '今期（' + P.seasonLabel + '）、出演作が多い声優 TOP10🎙\\n' + lines + '\\n4位以下は画像で👀\\n\\n声優名で出演作と配信先を検索👇\\n' + utm('/ranking/', 'datapost') + '\\n#今期アニメ #声優',
    card: { kicker: P.seasonLabel + '｜配信中の作品で集計・同数は五十音順で10人まで', title: '今期の出演作が多い声優 TOP10', rows: P.top.map(a => ({ lead: a.rank + '位', main: a.name, right: a.n + '作品' })), foot: 'animecastnow.com で声優名を検索' },
  });
}
// 2) 来期作品のキャスト×今期の出演作数（週替わり）
if (P.castWorks.length) {
  const w = P.castWorks[weekOf % P.castWorks.length];
  const lines = w.cast.slice(0, 3).map(x => '・' + x.name + '（' + x.c + '）' + x.n + '作品').join('\\n');
  addCard({
    name: '来期作品のキャスト、今期は何作？',
    text: '来期の「' + w.t + '」のキャスト、今期の出演作は何作？🎙\\n' + lines + '\\n\\n放送前に、今期の出演作をチェック👇\\n' + utm('/work/' + w.id + '/', 'datapost') + '\\n#' + P.nextLabel.replace(/\\s/g, '') + ' #声優',
    card: { kicker: P.nextLabel + '｜キャストの今期の出演作数', title: '「' + w.t + '」', rows: w.cast.map(x => ({ lead: x.n + '作品', main: x.name + '（' + x.c + '）' })), foot: '放送前に今期の出演作をチェック' },
  });
}
// 3) 来期の新キャスト（直近7日）
const recent = (() => {
  if (!P.newCast.length) return [];
  const latest = P.newCast.reduce((m, e) => e.date > m ? e.date : m, '');
  const from = new Date(Date.parse(latest) - 7 * 864e5).toISOString().slice(0, 10);
  return P.newCast.filter(e => e.date > from);
})();
if (recent.length) {
  const lines = recent.slice(0, 4).map(e => '・「' + e.t + '」' + e.c + '：' + e.name).join('\\n');
  addCard({
    name: '今週わかった来期の新キャスト',
    text: '今週わかった来期（' + P.nextLabel + '）の新キャスト🎙\\n' + lines + (recent.length > 4 ? '\\nほか' + (recent.length - 4) + '件' : '') + '\\n\\n来期の放送日とキャストの一覧👇\\n' + utm('/next/', 'datapost') + '\\n#来期アニメ #声優',
    card: { kicker: P.nextLabel + '｜今週の追加分', title: '今週わかった来期の新キャスト', rows: recent.slice(0, 9).map(e => ({ lead: e.name.slice(0, 5), main: '「' + e.t + '」' + e.c })), foot: '来期の放送日とキャストは animecastnow.com/next/' },
  });
}
// 4) 今週から放送開始（今日から7日以内）
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const until = new Date(Date.now() + 9 * 3600e3 + 7 * 864e5).toISOString().slice(0, 10);
const soon = P.schedule.filter(s => s.d >= today && s.d <= until);
const md = d => { const [, m, dd] = d.split('-').map(Number); return m + '/' + dd; };
if (soon.length) {
  addCard({
    name: '今週から放送開始',
    text: '今週から放送開始の' + P.nextLabel + '📺\\n' + soon.slice(0, 5).map(s => md(s.d) + ' ' + s.t).join('\\n') + (soon.length > 5 ? '\\nほか' + (soon.length - 5) + '作品' : '') + '\\n\\nキャストと放送日の一覧👇\\n' + utm('/next/', 'datapost') + '\\n#' + P.nextLabel.replace(/\\s/g, ''),
    card: { kicker: P.nextLabel + '｜放送開始日', title: '今週から放送開始', rows: soon.slice(0, 9).map(s => ({ lead: md(s.d), main: s.t })), foot: 'キャストは animecastnow.com/next/' },
  });
}
if (!$('#cards').children.length) $('#cards').innerHTML = '<p class="empty">今週のデータポストはありません。</p>';
})();
</script>
</body>
</html>
`;
}
