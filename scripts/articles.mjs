import { readFileSync } from 'node:fs';
import { iconSvg, plateOf, plateStyle, splitTitle } from './plate.mjs';
// データ（data.json）から、クールごとに作り直す記事ページを生成する。
// generate-pages.mjs から呼ばれる。見た目は about/index.html と揃える。

const PROVIDER_LABEL = { 'Amazon Prime Video': 'Prime Video' };
const label = provider => PROVIDER_LABEL[provider] ?? provider;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const toPageId = actorId => String(actorId).replace(/^va/, '');

// about/index.html から、共通のスタイルと計測スクリプトを取り出す
function shellParts(aboutHtml) {
  const style = aboutHtml.slice(aboutHtml.indexOf('<style>') + 7, aboutHtml.indexOf('</style>'));
  const scripts = aboutHtml.slice(aboutHtml.indexOf('<script>'), aboutHtml.indexOf('</body>'));
  return { style, scripts };
}

const EXTRA_STYLE = `
.site-logo img{display:block;height:28px;width:auto}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:15px}
th,td{padding:8px 6px;border-bottom:1px solid #e3dfd2;text-align:left;vertical-align:top}
th{color:#827f77;font-size:13px;font-weight:700}
td.num{white-space:nowrap;font-weight:700;text-align:right}
.rank{width:3.2em;white-space:nowrap;color:#62517f;font-weight:800}
.works{color:#5d5a52;font-size:13px;line-height:1.6}
.lead{font-size:17px}
.note{color:#827f77;font-size:13px}
.bar{display:block;height:8px;margin-top:4px;border-radius:4px;background:#d8d0e4}
.bar i{display:block;height:100%;border-radius:4px;background:#62517f}
details{margin:6px 0 0}summary{cursor:pointer;color:#62517f;font-size:14px}
.cta{display:inline-block;margin-top:6px;padding:6px 14px;border:1px solid #d8d0e4;border-radius:999px;background:#f5f2fa;color:#4b3d6b;font-size:14px;font-weight:700;text-decoration:none}
h3{margin:20px 0 6px;font-size:16px}
table.compare tr.partner td{background:#f5f2fa}.pr{font-size:10px;color:#62517f}.cta.wide{display:block;text-align:center;margin:2px 0 4px;padding:10px 14px;background:#62517f;border-color:#62517f;color:#fff;font-weight:800}
.end-cta{margin:28px 0 8px;padding:14px 16px;border-radius:14px;background:#f5f2fa;border:1px solid #e3dcef}.end-cta p{margin:0 0 8px}.end-cta p:first-child{font-weight:700;font-size:15px}
.related{margin-top:40px;padding-top:16px;border-top:1px solid #e3dfd2}
.date{white-space:nowrap;font-weight:700}
.countdown{display:inline-block;margin-left:4px;padding:0 7px;border-radius:999px;background:#f5f2fa;color:#62517f;font-size:12px;font-weight:700;white-space:nowrap}
.countdown:empty{display:none}
.top-cta{margin:8px 0 4px}
.raw-ad{padding:4px 2px}.raw-ad a{font-weight:800;font-size:15px}
.costar{margin:22px 0 8px}.costar h2{margin-bottom:2px}
.costar-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}
.costar-list a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;padding:11px 14px;border:1px solid #e3dcef;border-radius:13px;background:#fff;color:inherit;text-decoration:none}
.costar-list a:hover{border-color:#62517f}
.costar-title{font-weight:800;font-size:15px;line-height:1.4;color:#1d2a44}
.costar-who{grid-column:1;color:#5d5a52;font-size:12px}
.costar-n{grid-column:2;grid-row:1/3;padding:3px 10px;border-radius:999px;background:#62517f;color:#fff;font-size:12px;font-weight:800;white-space:nowrap}
.costar details{margin-top:8px}
.cast-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.cast-list a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1px 10px;align-items:center;padding:10px 14px;border:1px solid #e3dcef;border-radius:13px;background:#fff;color:inherit;text-decoration:none}
.cast-list a:hover{border-color:#62517f}
.cast-name{font-weight:800;font-size:16px;line-height:1.35;color:#1d2a44}
.cast-role{grid-column:1;color:#5d5a52;font-size:12px}
.cast-n{grid-column:2;grid-row:1/4;color:#62517f;font-size:12px;font-weight:800;white-space:nowrap}
.cast-rep{grid-column:1;color:#7a7568;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cast details{margin-top:8px}
.rk{list-style:none;margin:12px 0;padding:0;display:grid;gap:8px}
.rk>li{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 12px;align-items:center;padding:11px 14px;border:1px solid #e3dcef;border-radius:14px;background:#fff}
.rk>li:hover{border-color:#62517f}
.rk-no{grid-row:1/3;min-width:2.4em;text-align:center;font-size:18px;font-weight:900;color:#62517f;line-height:1}.rk-no small{font-size:11px;margin-left:1px}
.rk-name{font-size:16px;font-weight:900;color:#1d2a44;line-height:1.35;text-decoration:none}.rk-name::after{content:"";position:absolute;inset:0;border-radius:14px}
.rk-works{grid-column:2/4;margin-top:2px;color:#5d5a52;font-size:12px;line-height:1.7}.rk-works a{position:relative;z-index:1;color:#62517f;text-decoration:none;border-bottom:1px solid #d6cde6}
.rk-n{grid-column:3;grid-row:1;justify-self:end;padding:4px 10px;border-radius:999px;background:#efebf5;color:#62517f;font-size:13px;font-weight:800;white-space:nowrap}
.rk.top>li{padding:16px;border-width:2px}.rk.top .rk-no{font-size:30px}.rk.top .rk-name{font-size:20px}.rk.top .rk-n{background:#62517f;color:#fff;font-size:14px}
.rk .r1{border-color:#F5C542;background:#fffaea}.rk .r1 .rk-no{color:#b8860b}
.rk .r2{border-color:#c4c8d0;background:#f7f8fa}.rk .r2 .rk-no{color:#7d8592}
.rk .r3{border-color:#ddb08a;background:#fdf6f0}.rk .r3 .rk-no{color:#a86a3d}
.month{margin:22px 0 6px;font-size:15px;font-weight:900;color:#62517f}
.sched{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sched>li{display:grid;grid-template-columns:62px minmax(0,1fr);gap:12px;padding:12px 14px;border:1px solid #e3dcef;border-radius:14px;background:#fff}
.sched.season-list>li{display:block}
.sched-date{text-align:center;font-weight:900;color:#1d2a44;font-size:15px;line-height:1.25}.sched-date small{display:block;font-size:11px;color:#62517f;font-weight:700}.sched-date .countdown{display:block;margin-top:4px;font-size:10px;color:#5d5a52;font-weight:700}
.sched-title{display:block;font-weight:800;font-size:15px;line-height:1.4;color:#1d2a44;text-decoration:none}
.sched>li{grid-template-columns:96px minmax(0,1fr);align-items:start}
.genre-chip{display:flex;width:fit-content;align-items:center;gap:3px;margin:5px 0 2px;padding:1px 8px;border:1px solid currentColor;border-radius:999px;background:#fff;font-size:11px;font-weight:800;line-height:1.6;vertical-align:top}.genre-chip svg{width:12px;height:12px}.genre-chip.seq-genre{margin:0 0 4px}.mini-plate{box-sizing:border-box;position:relative;display:flex;flex-direction:column;justify-content:flex-end;flex:none;width:96px;aspect-ratio:4/3;padding:5px 6px;border-radius:10px;overflow:hidden;color:#fff;text-decoration:none}.mini-plate .mini-ic{position:absolute;right:-6px;bottom:-8px;width:52px;height:52px;opacity:.18}.mini-plate i{position:relative;font-style:normal;font-size:9.5px;font-weight:700;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini-plate b{position:relative;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;font-size:12px;line-height:1.25;font-weight:800;font-synthesis:none}
.sched-day{display:inline-block;margin-bottom:3px;padding:1px 8px;border-radius:999px;background:#efebf5;color:#62517f;font-size:11px;font-weight:800}.sched-day .countdown{display:inline;margin-left:4px;font-size:11px;color:#62517f}
.sched-catch{margin-top:3px;font-size:12px;color:#62517f;font-weight:700}
.newcast{margin:18px 0 10px;padding:14px 16px;border-radius:14px;background:#1d2a44;color:#fff}.newcast h2{margin:0 0 4px;font-size:17px;color:#fff}.newcast>p{margin:0 0 10px;font-size:12px;opacity:.8}
.newcast-top{list-style:none;margin:0;padding:0;display:grid;gap:8px}.newcast-top a{color:#fff;text-decoration:none;font-size:13px}.newcast-top b{color:#F5C542}.newcast-top span{display:block;font-size:11px;opacity:.75}
.newcast details{margin-top:10px}.newcast summary{color:#F5C542;font-weight:800;font-size:13px;cursor:pointer}.newcast details h3{color:#fff;font-size:13px}.newcast details li,.newcast details a{color:#fff;font-size:12px}
.sched-cast{margin-top:3px;font-size:12.5px;color:#5d5a52;line-height:1.6}.sched-cast a{color:#62517f;font-weight:700;text-decoration:none;border-bottom:1px solid #d6cde6}
.sched-chip{display:inline-block;margin-top:6px;padding:2px 9px;border-radius:999px;background:#F5C542;color:#1d2a44;font-size:11px;font-weight:800;text-decoration:none}
.chips-va{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}.chips-va a{display:inline-flex;align-items:baseline;gap:5px;padding:7px 12px;border:1px solid #e3dcef;border-radius:999px;background:#fff;color:#1d2a44;font-weight:800;font-size:14px;text-decoration:none}.chips-va a em{font-style:normal;font-size:11px;color:#62517f}
.pair{list-style:none;margin:12px 0;padding:0;display:grid;gap:10px}
.pair>li{padding:14px 16px;border:1px solid #e3dcef;border-radius:14px;background:#fff}
.pair.top>li:first-child{border:2px solid #F5C542;background:#fffaea}
.pair-h{display:flex;align-items:center;justify-content:space-between;gap:10px}
.pair-names{font-size:17px;font-weight:900;color:#1d2a44;line-height:1.4}.pair-names a{color:#1d2a44;text-decoration:none;border-bottom:2px solid #d6cde6}.pair-names i{font-style:normal;color:#62517f;margin:0 6px}
.pair-n{flex:none;padding:4px 10px;border-radius:999px;background:#62517f;color:#fff;font-size:13px;font-weight:800;white-space:nowrap}
.pair-works{margin:8px 0 0;padding:0;list-style:none;font-size:13px;line-height:1.7}.pair-works li::before{content:"・";color:#62517f}.pair-works a{color:#62517f;font-weight:700}.pair-works span{display:block;margin-left:1em;color:#5d5a52;font-size:12px;line-height:1.5}
.seq{list-style:none;margin:12px 0;padding:0;display:grid;gap:12px}
.seq>li{padding:14px 16px;border:1px solid #e3dcef;border-radius:14px;background:#fff}
.genre-chip{display:flex;width:fit-content;align-items:center;gap:3px;margin:5px 0 2px;padding:1px 8px;border:1px solid currentColor;border-radius:999px;background:#fff;font-size:11px;font-weight:800;line-height:1.6;vertical-align:top}.genre-chip svg{width:12px;height:12px}.genre-chip.seq-genre{margin:0 0 4px}.mini-plate{box-sizing:border-box;position:relative;display:flex;flex-direction:column;justify-content:flex-end;flex:none;width:96px;aspect-ratio:4/3;padding:5px 6px;border-radius:10px;overflow:hidden;color:#fff;text-decoration:none}.mini-plate .mini-ic{position:absolute;right:-6px;bottom:-8px;width:52px;height:52px;opacity:.18}.mini-plate i{position:relative;font-style:normal;font-size:9.5px;font-weight:700;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini-plate b{position:relative;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;font-size:12px;line-height:1.25;font-weight:800;font-synthesis:none}
.seq-head{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:center}.seq-head .note{margin:4px 0 0}
.seq-title{font-size:16px;font-weight:900;line-height:1.45}.seq-title a{color:#1d2a44;text-decoration:none}
.seq-prev{margin:8px 0 4px;padding:8px 12px;border-radius:10px;background:#f8f6fc;font-size:13px;line-height:1.6}.seq-prev b{color:#62517f}
.seq .cta{margin-top:6px}
.cta:has(.cta-main){border-radius:14px;padding:8px 16px}.cta .cta-main{display:block}.cta .cta-sub{display:block;margin-top:1px;font-size:12px;font-weight:600;opacity:.85}
.follow-x{display:flex;align-items:center;gap:12px;margin:26px 0 8px;padding:14px 16px;border-radius:14px;background:#111;color:#fff}.follow-x p{flex:1;margin:0;min-width:0;line-height:1.4}.follow-x b{display:block;font-size:14px}.follow-x span{font-size:11px;opacity:.7}.follow-x a{flex:none;padding:8px 14px;border-radius:999px;background:#fff;color:#111;font-size:13px;font-weight:900;text-decoration:none}
.prev{margin:22px 0 8px;padding:14px 16px;border:1px solid #e3dcef;border-radius:14px;background:#f8f6fc}.prev h2{margin:0 0 6px}.prev p{margin:6px 0}
details.notes summary{margin-top:2px}
`;

// X のフォローへの導線（X から来た人の着地ページの最後に置く）
function followBox(path) {
  const pageType = path.split('/')[1] || 'home';
  return `<aside class="follow-x"><p><b>新しいキャスト情報は X でも発信しています</b><span>@animecastnow</span></p><a href="https://x.com/animecastnow" target="_blank" rel="noopener" data-ga-event="x_follow_click" data-ga-page-type="${esc(pageType)}" aria-label="X（@animecastnow）をフォロー">＋ フォロー</a></aside>`;
}

function page({ origin, ogImage, aboutHtml, path, title, description, body, noindex = false, extraScript = '', jsonLd = null, data = null, seasonLabel = '' }) {
  const { style, scripts } = shellParts(aboutHtml);
  const url = `${origin}${path}`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f8f7f2">
<title>${esc(title)}｜ANIME CAST NOW</title>
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="ANIME CAST NOW">
<meta property="og:image" content="${ogImage}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n` : ''}<style>${style}${EXTRA_STYLE}</style>
</head>
<body>
<main>
<p class="site-logo"><a href="/"><img src="/assets/logo.svg" alt="ANIME CAST NOW トップへ" width="780" height="100"></a></p>
<p class="note">当ページのリンクには広告が含まれています。</p>
${body}
${followBox(path)}
<div class="related">
<p><strong>関連ページ</strong></p>
<ul>
<li><a href="/">声優名で今期の出演作を検索する</a></li>
<li><a href="/ranking/">今期の出演本数ランキング</a></li>
<li><a href="/vod/">配信サービス別の作品数</a></li>
<li><a href="/work/">今期の作品一覧（配信はどこ？）</a></li>
<li><a href="/next/">来期アニメの放送日とキャスト</a></li>
<li><a href="/costar/">今期よく共演している声優コンビ</a></li>
<li><a href="/sequel/">続編アニメの前に見ておきたい作品</a></li>
${data?.season && seasonLabel ? `<li><a href="/season/${esc(data.season)}/">${esc(seasonLabel)} 声優・キャストまとめ</a></li>` : ''}
<li><a href="/about/">このサイトと運営者について</a></li>
</ul>
<p class="note">本ページのリンクにはアフィリエイトを含みます。配信状況は各サービスでご確認ください。</p>
</div>
</main>
${extraScript}${scripts}</body>
</html>
`;
}

// 同点は同じ順位にする（1, 2, 2, 4 …）
function rankRows(items, value) {
  let previous = null;
  let rank = 0;
  return items.map((item, index) => {
    const v = value(item);
    if (v !== previous) rank = index + 1;
    previous = v;
    return { rank, item };
  });
}

// ctx.upcoming が true のときは来期版（/next/ranking/）。キャストが発表されている作品だけで数える
export function rankingPage(ctx) {
  const { data, seasonLabel } = ctx;
  const upcoming = Boolean(ctx.upcoming);
  const actors = data.voice_actors
    .map(actor => ({ actor, count: new Set(actor.roles.map(role => role.work_id)).size }))
    .sort((a, b) => b.count - a.count || a.actor.reading.localeCompare(b.actor.reading, 'ja'));
  const total = actors.length;
  const multi = actors.filter(a => a.count >= 2).length;
  const three = actors.filter(a => a.count >= 3).length;
  const average = (actors.reduce((sum, a) => sum + a.count, 0) / total).toFixed(2);
  const threshold = upcoming ? 3 : 5;
  const ranked = rankRows(actors.filter(a => a.count >= threshold), a => a.count);
  const top = ranked[0]?.item;
  const workTitle = id => data.works[id]?.title ?? '';

  const card = ({ rank, item: { actor, count } }, index) => {
    // 1〜3位は4作品、4位以降は3作品まで出す（長い作品名でカードが伸びすぎないように）
    const SHOWN_WORKS = rank <= 3 ? 4 : 3;
    const seen = new Set();
    const ids = actor.roles.filter(role => !seen.has(role.work_id) && seen.add(role.work_id)).map(role => role.work_id);
    const links = ids.slice(0, SHOWN_WORKS).map(id => `<a href="/work/${esc(id)}/" data-ga-event="ranking_click" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${index + 1}" data-ga-page-type="${upcoming ? 'next_ranking_work' : 'ranking_work'}">${esc(workTitle(id))}</a>`);
    // 名前のリンクはカード全体に広げる（作品名のリンクだけは作品ページへ）
    return `<li class="r${rank}"><span class="rk-no">${rank}<small>位</small></span><a class="rk-name" href="/va/${toPageId(actor.actor_id)}/" data-ga-event="ranking_click" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${index + 1}" data-ga-page-type="${upcoming ? 'next_ranking' : 'ranking'}">${esc(actor.name)}</a><span class="rk-works">${links.join('、')}${ids.length > SHOWN_WORKS ? ` ほか${ids.length - SHOWN_WORKS}作品` : ''}</span><span class="rk-n">${count}作品 ›</span></li>`;
  };
  const topRows = ranked.filter(r => r.rank <= 3);
  const restRows = ranked.filter(r => r.rank > 3);

  const title = `${seasonLabel}の声優 出演本数ランキング`;
  const description = upcoming
    ? `${seasonLabel}のテレビアニメに出演が決まっている声優${total}名を、出演作品数で集計したランキングです。${top ? `いま1位は${top.actor.name}さん（${top.count}作品）。` : ''}出演作と役名、放送日も確認できます。`
    : `${seasonLabel}のテレビアニメに出演している声優${total}名を、出演作品数で集計したランキングです。${top ? `1位は${top.actor.name}さん（${top.count}作品）。` : ''}出演作と役名、配信サービスも確認できます。`;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">${upcoming
    ? `${esc(seasonLabel)}にいちばん多く出る声優は？ キャストが発表されている作品で、出演作品数を数えました。キャストの発表が続いているので、順位は変わることがあります。カードを押すと声優の出演作、作品名を押すと作品ページを見られます。`
    : `今期いちばん多くの作品に出ている声優は？ ${esc(seasonLabel)}の出演作品数で並べました。カードを押すと声優の出演作と配信先、作品名を押すと作品ページを見られます。`}</p>
<ol class="rk top">
${topRows.map((r, i) => card(r, i)).join('\n')}
</ol>
${restRows.length ? `<h2>${restRows[0].rank}位から（${threshold}作品以上）</h2>
<ol class="rk">
${restRows.map((r, i) => card(r, topRows.length + i)).join('\n')}
</ol>` : ''}
${!upcoming && ctx.nextLabel ? `<p><a class="cta" href="/next/ranking/">${esc(ctx.nextLabel)}の出演本数ランキングを見る ›</a></p>` : ''}${upcoming ? `<p><a class="cta" href="/next/">${esc(seasonLabel)}の放送日とキャスト一覧へ ›</a></p>` : ''}

<h2>集計について</h2>
<p class="note">掲載している${esc(seasonLabel)}のテレビアニメ${Object.keys(data.works).length}作品${upcoming ? '（キャスト発表前の作品を含む）' : ''}のキャストから、声優ごとの出演作品数を数えました。掲載している声優は${total}名で、2作品以上に出ているのは${multi}名（${Math.round((multi / total) * 100)}%）、3作品以上は${three}名、1人あたりの平均は${average}作品です。同じ作品で複数の役を演じている場合は1作品として数えています。</p>
<p class="note">作品とキャストの情報は、アニメ作品データベース「Annict」のAPIをもとにしています（最終更新：${esc(data.updated_at.slice(0, 10))}）。放送開始後にキャストが追加される作品もあるため、数は変わることがあります。</p>`;
  return page({ ...ctx, path: upcoming ? '/next/ranking/' : '/ranking/', title, description, body });
}

// 少ないサービス数で、どれだけの作品をカバーできるか（貪欲法）
function coverage(worksWithVod) {
  const remaining = new Set(worksWithVod.map(([id]) => id));
  const byProvider = new Map();
  for (const [id, work] of worksWithVod) {
    for (const link of work.vod_links) {
      if (!byProvider.has(link.provider)) byProvider.set(link.provider, new Set());
      byProvider.get(link.provider).add(id);
    }
  }
  const steps = [];
  const total = remaining.size;
  while (remaining.size && steps.length < 4) {
    let best = null;
    let bestGain = 0;
    for (const [provider, ids] of byProvider) {
      const gain = [...ids].filter(id => remaining.has(id)).length;
      if (gain > bestGain) [best, bestGain] = [provider, gain];
    }
    if (!best) break;
    for (const id of byProvider.get(best)) remaining.delete(id);
    steps.push({ provider: best, covered: total - remaining.size });
  }
  return { steps, total };
}

// 各サービスの料金と無料体験（公式のヘルプ・案内ページで確認した値だけ。確認できない項目は null）。確認日と出典も残す
const VOD_PLANS_CHECKED = '2026年11月';
const VOD_PLANS = {
  'Amazon Prime Video': { price: '600円', trial: '初回30日間', source: 'https://selectra.jp/streaming/amazon-prime' },
  'dアニメストア': { price: '660円', trial: '初回31日間※', source: 'https://animestore.docomo.ne.jp/animestore/CF/help_qa_charge' },
  'U-NEXT': { price: '2,189円', trial: '31日間', source: 'https://help.unext.jp/guide/detail/types-of-service-plan' },
  'DMM TV': { price: '550円', trial: '初回あり※', source: 'https://support.dmm.com/premium/article/47489' },
  'ABEMA': { price: '680円〜※', trial: 'なし', source: 'https://www.cinematoday.jp/ent/?p=41980' },
};

// A8 で発行されたコードを、1文字も変えずにそのまま貼るもの（A8 は文言の変更やリンク部分だけの使用を禁止しているため）。
// 書き換えたくなったら、A8 で原稿を取り直して丸ごと差し替える。
const RAW_AD_CODES = {
  'ABEMA': `<a href="https://px.a8.net/svt/ejp?a8mat=4BEPPX+6IKT4I+4EKC+60OXE" rel="nofollow">オリジナルコンテンツ数No1！【ABEMAプレミアム】</a>
<img border="0" width="1" height="1" src="https://www12.a8.net/0.gif?a8mat=4BEPPX+6IKT4I+4EKC+60OXE" alt="">`,
};

function compareTable(providers, partnerLinks) {
  const rows = providers.map(([provider, ids]) => {
    const plan = VOD_PLANS[provider];
    const partner = partnerLinks[provider];
    const cell = value => (value ? esc(value) : '<span class="note">—</span>');
    const raw = !partner ? RAW_AD_CODES[provider] : null;
    const row = `<tr${partner || raw ? ' class="partner"' : ''}><td><strong>${esc(label(provider))}</strong>${partner || raw ? '<br><span class="pr">PR</span>' : ''}</td><td class="num">${ids.length}作品</td><td>${cell(plan?.price)}</td><td>${cell(plan?.trial)}</td></tr>`;
    const cta = partner
      ? `<tr class="partner"><td colspan="4"><a class="cta wide" href="${esc(partner)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(provider)}" data-ga-page-type="vod_compare" data-ga-position="0">${esc(ctaText(provider))} ↗</a>${PARTNER_NOTES[provider] ? `<br><span class="note">${esc(PARTNER_NOTES[provider])}</span>` : ''}</td></tr>`
      : raw
        ? `<tr class="partner"><td colspan="4"><div class="raw-ad" data-ga-event="vod_click" data-ga-provider="${esc(provider)}" data-ga-page-type="vod_compare" data-ga-position="0">${raw}</div></td></tr>`
        : '';
    return row + cta;
  }).join('\n');
  const sources = Object.entries(VOD_PLANS).map(([provider, plan]) => `<a href="${esc(plan.source)}" target="_blank" rel="noopener">${esc(label(provider))}</a>`).join('、');
  return `<h2>今期アニメを多く見られる配信サービス</h2>
<p>今期の作品数と、月額料金・無料体験をまとめました。月額は税込で、ブラウザから登録した場合の料金です（アプリから登録すると高くなるサービスがあります）。</p>
<table class="compare">
<thead><tr><th>サービス</th><th>今期の作品</th><th>月額</th><th>無料体験</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p class="note">料金と無料体験は${VOD_PLANS_CHECKED}時点で各社の案内を確認したものです（${sources}）。「—」は、こちらでまだ確認できていない項目です（各社の公式サイトで確認してください）。dアニメストアの31日間はキャンペーン中の期間で、通常は7日間です。DMM TVの無料期間は登録ページに表示されます。ABEMAの680円は広告つきプランの料金で、広告なしのプランは1,180円です（公式サイトで確認してください）。無料期間が終わると自動で有料になります。リンクは提携しているサービスだけに付けています。</p>`;
}

export function vodPage(ctx) {
  const { data, seasonLabel, partnerLinks } = ctx;
  const works = Object.entries(data.works);
  const withVod = works.filter(([, work]) => work.vod_links?.length);
  const counts = new Map();
  for (const [id, work] of withVod) {
    for (const link of work.vod_links) {
      if (!counts.has(link.provider)) counts.set(link.provider, []);
      counts.get(link.provider).push(id);
    }
  }
  const providers = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const max = providers[0]?.[1].length ?? 1;
  const ranked = rankRows(providers, ([, ids]) => ids.length);
  const { steps, total } = coverage(withVod);

  const rows = ranked.map(({ rank, item: [provider, ids] }) => {
    const titles = ids.map(id => ({ id, title: data.works[id].title })).sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    const partner = partnerLinks[provider];
    const cta = partner
      ? `<a class="cta" href="${esc(partner)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(provider)}" data-ga-page-type="vod_article" data-ga-position="${rank}">${esc(ctaText(provider))} ↗</a>`
      : '';
    return `<tr><td class="rank">${rank}位</td><td><strong>${esc(label(provider))}</strong><span class="bar"><i style="width:${Math.round((ids.length / max) * 100)}%"></i></span>
<details><summary>配信作品を見る（${ids.length}作品）</summary><div class="works">${titles.map(t => `<a href="/work/${esc(t.id)}/">${esc(t.title)}</a>`).join('、')}</div></details>${cta}</td><td class="num">${ids.length}作品<br><span class="note">${Math.round((ids.length / withVod.length) * 100)}%</span></td></tr>`;
  }).join('\n');

  const coverageText = steps.map((step, index) => {
    const names = steps.slice(0, index + 1).map(s => label(s.provider)).join('＋');
    return `<li>${esc(names)}：${step.covered}作品（${Math.round((step.covered / total) * 100)}%）</li>`;
  }).join('\n');

  const leader = providers[0];
  const title = `${seasonLabel} 配信サービス別の作品数`;
  const description = `${seasonLabel}のテレビアニメが、どの動画配信サービスで何作品見られるかを集計しました。${leader ? `最も多いのは${label(leader[0])}（${leader[1].length}作品）。` : ''}少ないサービス数でどこまでカバーできるかも紹介します。`;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">今期のアニメをまとめて見るなら、どの配信サービスがよいのか。ANIME CAST NOW に掲載している${esc(seasonLabel)}のテレビアニメのうち、配信先が確認できた${withVod.length}作品について、サービスごとの作品数を集計しました。</p>

${compareTable(providers, partnerLinks)}

<h2>サービス別の配信作品数</h2>
<p class="note">割合は、配信先が確認できた${withVod.length}作品に対する比率です。見放題・レンタルの区別や、配信開始日は各サービスでご確認ください。</p>
<table>
<thead><tr><th>順位</th><th>配信サービス</th><th>作品数</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>

<h2>少ないサービス数で、どこまで見られる？</h2>
<p>作品数の多いサービスから順に組み合わせたときに、今期の作品をどこまでカバーできるかを計算しました。</p>
<ul>
${coverageText}
</ul>
<p>1つのサービスですべての作品を見ることはできませんが、2〜3サービスを組み合わせると、今期の作品の多くをカバーできます。気になる声優の出演作がどのサービスにあるかは、<a href="/">声優名で検索</a>すると作品ごとに確認できます。</p>

<h2>集計について</h2>
<p class="note">配信先の情報は、Annictの作品情報、各作品の公式サイト、配信サービスの公式ラインナップなどを運営者が確認したものです（最終更新：${esc(data.updated_at.slice(0, 10))}）。配信状況は各サービスの都合で変わることがあります。</p>`;
  return page({ ...ctx, path: '/vod/', title, description, body });
}

// 作品ごとの「配信はどこ？」ページ
// 主役級の手動指定（data/main-cast.json）
let MAIN_CAST = {};
try {
  MAIN_CAST = JSON.parse(readFileSync(new URL('../data/main-cast.json', import.meta.url), 'utf8')).works ?? {};
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
// 説明文用：「役名：声優名」を先頭から n 人
const castPairs = (cast, n) => cast.slice(0, n).map(({ actor, roles }) => `${roles[0]}：${actor.name}`).join('、');
// 説明文の頭：「〇〇」の声優は、役名：声優名…ほか○名。（キャスト未発表なら、その旨）
const castLead = (title, cast) => cast.length ? `「${title}」の声優は、${castPairs(cast, 3)}${cast.length > 3 ? `ほか${cast.length}名` : ''}。` : `「${title}」のキャストは未発表です。`;

// 作品の小さなタイトルプレート（/next/・/sequel/ の作品カードの左）。他社の画像は使わず、ジャンルの色・柄・アイコンと作品名で見せる
function miniPlate(title, href, text = splitTitle(title).main) {
  const p = plateOf(title);
  return `<a class="mini-plate" href="${esc(href)}" tabindex="-1" aria-hidden="true" style="${plateStyle(p)}">${iconSvg(p.icon, 'mini-ic')}<b style="font-family:${esc(p.font)}">${esc(text)}</b></a>`;
}

// ジャンル名の小さなラベル（/next/・/sequel/ で日付や作品名の横に出す）。作品名と混ざらないよう、カードの外に枠線つきで置く
function genreChip(title, cls = '') {
  const p = plateOf(title);
  if (p.key === 'none') return '';
  return `<span class="genre-chip${cls}" style="color:${p.color}">${iconSvg(p.icon, '')}${esc(p.short)}</span>`;
}

// 運営者（ゆすら）のひとこと。本人の回答をもとにしたもの（data/owner_notes.json）。AI の下書きの作品紹介とは分けて置く
let OWNER_NOTES = {};
try { OWNER_NOTES = JSON.parse(readFileSync(new URL('../data/owner_notes.json', import.meta.url), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
export const ownerNoteOf = title => (title !== '_about' && OWNER_NOTES[title]?.comment ? OWNER_NOTES[title] : null);
function ownerSection(title) {
  const n = ownerNoteOf(title);
  if (!n) return '';
  const [y, m, d] = String(n.date).split('-').map(Number);
  return `<section class="owner-note" aria-labelledby="owner-h"><h2 id="owner-h">運営者のひとこと</h2>
<p class="owner-meta"><b>ゆすら</b>（<a href="/about/#owner">運営者について</a>）・${esc(n.watched)}（${y}年${m}月${d}日時点）</p>
<p>${esc(n.comment)}</p>
${n.recommend ? `<p class="owner-rec"><b>こんな人におすすめ</b>${esc(n.recommend)}</p>` : ''}</section>`;
}

export function castOf(data) {
  const byWork = new Map();
  for (const actor of data.voice_actors) {
    for (const role of actor.roles) {
      if (!byWork.has(role.work_id)) byWork.set(role.work_id, []);
      const list = byWork.get(role.work_id);
      const same = list.find(x => x.actor.actor_id === actor.actor_id);
      if (same) same.roles.push(role.character_name);
      else list.push({ actor, roles: [role.character_name] });
    }
  }
  // 登録順（character_id の末尾の連番）に並べる。多くの作品ではこれが公式のクレジット順。
  // 続編などで新しい役が先に登録されている作品は、data/main-cast.json に書いた主役級を先頭にする
  const order = actor => Math.min(...actor.roles.map(r => Number(String(r.character_id ?? '').split('-').pop()) || Infinity));
  for (const [workId, list] of byWork) {
    const main = MAIN_CAST[data.works?.[workId]?.title] ?? [];
    const rank = c => {
      const roles = c.actor.roles.filter(r => r.work_id === workId);
      const hit = Math.min(...roles.map(r => { const i = main.findIndex(name => String(r.character_name).startsWith(name)); return i < 0 ? Infinity : i; }));
      return hit < Infinity ? hit - 1000 : order({ roles });
    };
    list.sort((a, b) => rank(a) - rank(b));
  }
  return byWork;
}

// 提携サービスの無料体験など。index.html の PARTNER_NOTES と同じ内容にする
const PARTNER_OFFERS = {
  'Amazon Prime Video': { cta: '30日間無料で試す', note: '※Amazonプライム会員の初回のみ。無料期間が終わると月額600円（2026年11月時点。条件は公式サイトで確認してください）' },
};
const PARTNER_NOTES = Object.fromEntries(Object.entries(PARTNER_OFFERS).map(([k, v]) => [k, v.note]));
const ctaText = provider => (PARTNER_OFFERS[provider] ? `${label(provider)}を${PARTNER_OFFERS[provider].cta}` : `${label(provider)}で見る`);
// 作品ごとのボタン：「この作品は○○で配信中」＋「30日間無料で試す」（見放題かレンタルかはデータでわからないので、無料で見られるとは書かない）
const workCtaHtml = provider => (PARTNER_OFFERS[provider]
  ? `<span class="cta-main">この作品は${esc(label(provider))}で配信中</span><span class="cta-sub">${esc(PARTNER_OFFERS[provider].cta)} ↗</span>`
  : `${esc(ctaText(provider))} ↗`);

// 手書きの作品紹介（data/work_notes.json）
function notesSection(note, title) {
  if (!note) return '';
  const hosts = (note.sources ?? []).map(url => {
    try { return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(new URL(url).hostname)}</a>`; } catch { return ''; }
  }).filter(Boolean);
  return `<h2>「${esc(title)}」はどんな作品？</h2>
<details class="notes"><summary>あらすじ・見どころを読む</summary>
<p>${esc(note.intro)}</p>
${note.broadcast ? `<p class="note">${esc(note.broadcast)}</p>` : ''}
${note.points?.length ? `<h3>見どころ</h3>
<ul>
${note.points.map(point => `<li>${esc(point)}</li>`).join('\n')}
</ul>` : ''}
${note.before ? `<h3>前作は見ておくべき？</h3>
<p>${esc(note.before)}</p>` : ''}
${note.staff ? `<p class="note">${esc(note.staff)}</p>` : ''}
${hosts.length ? `<p class="note">参考：${hosts.join('、')}</p>` : ''}
</details>`;
}

// 「この作品の声優が、ほかに出ている作品」。作品ページの最初の画面に出す（共演人数の多い順、5件＋残りはたたむ）
// キャスト（声優ページへの入口）。最初の CAST_SHOWN 人を出し、残りは畳む
const CAST_SHOWN = 8;
// 作品名を比べるための正規化（空白・記号を除く）
const normTitle = t => String(t ?? '').normalize('NFKC').toLowerCase().replace(/[\s・:：!！?？、。「」『』()（）\-－〜~]/g, '');
// 同じシリーズか（先頭の6文字が同じなら同じシリーズとみなす）
function sameSeries(a, b) {
  const x = normTitle(a), y = normTitle(b);
  const n = Math.min(6, x.length, y.length);
  return n > 0 && x.slice(0, n) === y.slice(0, n);
}
// 声優の主な過去作から1つ（この作品と同じシリーズは除く）
function repWork(past, actorId, title) {
  return (past?.(actorId) ?? []).find(w => w.character && !sameSeries(w.title, title)) ?? null;
}

function castHtml({ id, title, cast, countOf, note, pageType, past, countPrefix = '今期' }) {
  if (!cast.length) return '';
  const item = ({ actor, roles }, index) => {
    const count = countOf(actor);
    const rep = repWork(past, actor.actor_id, title);
    return `<li><a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="cast_click" data-ga-work-id="${esc(id)}" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${index + 1}" data-ga-page-type="${esc(pageType)}"><span class="cast-name">${esc(actor.name)}</span><span class="cast-role">${esc(roles.join('／'))}${/ナレーション$/.test(roles.at(-1) ?? '') ? '' : ' 役'}</span>${rep ? `<span class="cast-rep">主な出演：${esc(rep.character)}（${esc(rep.title)}）</span>` : ''}<span class="cast-n">${count ? `${countPrefix}${count}作品 ›` : '›'}</span></a></li>`;
  };
  return `<section class="cast" aria-labelledby="cast-h">
<h2 id="cast-h">キャスト（${cast.length}名）</h2>
<p class="note">${esc(note)}</p>
<ul class="cast-list">
${cast.slice(0, CAST_SHOWN).map((c, i) => item(c, i)).join('\n')}
</ul>
${cast.length > CAST_SHOWN ? `<details><summary>ほか${cast.length - CAST_SHOWN}名を見る</summary>
<ul class="cast-list">
${cast.slice(CAST_SHOWN).map((c, i) => item(c, i + CAST_SHOWN)).join('\n')}
</ul>
</details>` : ''}
</section>`;
}

function costarHtml({ id, title, related, works, heading, what, pageType }) {
  if (!related.length) return '';
  const item = ([wid, actors], index) =>
    `<li><a href="/work/${esc(wid)}/" data-ga-event="costar_click" data-ga-work-id="${esc(id)}" data-ga-target-work-id="${esc(wid)}" data-ga-position="${index + 1}" data-ga-page-type="${esc(pageType)}"><span class="costar-title">${esc(works[wid].title)}</span><span class="costar-who">${esc([...actors].slice(0, 3).join('、'))}${actors.size > 3 ? ` ほか${actors.size - 3}名` : ''}</span><span class="costar-n">${actors.size}人</span></a></li>`;
  return `<section class="costar" aria-labelledby="costar-h">
<h2 id="costar-h">${esc(heading)}</h2>
<p class="note">「${esc(title)}」の声優が出演する${esc(what)}です。共演している人数が多い順。</p>
<ol class="costar-list">
${related.slice(0, 5).map((r, i) => item(r, i)).join('\n')}
</ol>
${related.length > 5 ? `<details><summary>ほか${related.length - 5}作品を見る</summary>
<ol class="costar-list">
${related.slice(5).map((r, i) => item(r, i + 5)).join('\n')}
</ol>
</details>` : ''}
</section>`;
}

// 続編の作品で「前のシーズンから見るなら」を出す（data/prev-seasons.json。配信を確かめた日付つき）
function prevSection({ ctx, id, work, pageType }) {
  const entry = ctx.prevSeasons?.[work.title];
  const url = entry && ctx.partnerLinks?.[entry.provider];
  if (!url) return '';
  const note = PARTNER_NOTES[entry.provider];
  return `<section class="prev" aria-labelledby="prev-h">
<h2 id="prev-h">前のシーズンから見るなら</h2>
<p>「${esc(entry.series)}」の${esc(entry.label)}は、${esc(label(entry.provider))}でプライム会員なら追加料金なしで見られます（${esc(entry.checked)}時点）。</p>
${ctx.notes?.[work.title]?.before ? `<p class="note">${esc(ctx.notes[work.title].before)}</p>` : ''}
<p><a class="cta" href="${esc(url)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(entry.provider)}" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}" data-ga-page-type="${esc(pageType)}" data-ga-position="1">${esc(ctaText(entry.provider))} ↗</a></p>
${note ? `<p class="note">${esc(note)}</p>` : ''}
</section>`;
}

// 作品ページの構造化データ（作品・キャスト・パンくず）
function workJsonLd({ origin, id, work, cast, listName, listPath }) {
  const url = `${origin}/work/${id}/`;
  const series = {
    '@type': 'TVSeries',
    name: work.title,
    url,
    inLanguage: 'ja',
    ...(work.start_date ? { startDate: work.start_date } : {}),
    ...(work.official_url ? { sameAs: [work.official_url] } : {}),
    actor: cast.map(({ actor }) => ({ '@type': 'Person', name: actor.name, url: `${origin}/va/${toPageId(actor.actor_id)}/` })),
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ANIME CAST NOW', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: listName, item: `${origin}${listPath}` },
      { '@type': 'ListItem', position: 3, name: work.title, item: url },
    ],
  };
  return { '@context': 'https://schema.org', '@graph': [series, breadcrumb] };
}

// シーズンの始まりの月（放送開始の目安。終わったシーズンのページで「2026年10月から放送」と書く）
const SEASON_START = { winter: 1, spring: 4, summer: 7, autumn: 10 };
export const seasonStartText = season => { const [y, n] = String(season).split('-'); return SEASON_START[n] ? `${y}年${SEASON_START[n]}月から放送` : ''; };

// ctx.archived が true のときは、放送が終わったシーズンのまとめとして作る（「今期」「配信中」を使わず、時点を明記する）
// ctx.skip に入っている作品は作らない（今期・来期のデータにある作品は、そちらで作る）
export function workPages(ctx) {
  const { data, seasonLabel, partnerServices } = ctx;
  const archived = Boolean(ctx.archived);
  const notes = ctx.notes ?? {};
  const byWork = castOf(data);
  const asOf = data.updated_at.slice(0, 10);
  return Object.entries(data.works).filter(([id]) => !ctx.skip?.has(id)).map(([id, work]) => {
    const cast = byWork.get(id) ?? [];
    const vods = work.vod_links ?? [];
    const partners = vods.filter(v => partnerServices.includes(v.provider));
    const others = vods.filter(v => !partnerServices.includes(v.provider));
    const names = vods.map(v => label(v.provider));

    // この作品の声優が、今期ほかに出ている作品（共演の多い順）
    const shared = new Map();
    for (const { actor } of cast) {
      for (const role of actor.roles) {
        if (role.work_id === id) continue;
        if (!shared.has(role.work_id)) shared.set(role.work_id, new Set());
        shared.get(role.work_id).add(actor.name);
      }
    }
    const related = [...shared.entries()]
      .sort((a, b) => b[1].size - a[1].size || data.works[a[0]].title.localeCompare(data.works[b[0]].title, 'ja'))
      .slice(0, 10);

    const serviceText = esc(names.length > 3 ? `${names.slice(0, 3).join('、')}など${names.length}サービス` : names.join('、'));
    const lead = archived
      ? `${esc(seasonLabel)}（${esc(seasonStartText(data.season))}）の作品です。${vods.length ? `${serviceText}で配信されていました（${esc(asOf)}時点）。今の配信状況は各サービスで確認してください。` : ''}`
      : vods.length
        ? `${serviceText}で配信中です（${esc(asOf)}時点）。`
        : `「${esc(work.title)}」の配信サービスは、まだ確認できていません（${esc(asOf)}時点）。配信が決まり次第、このページに追加します。`;
    const buttons = partners.map((v, index) =>
      `<a class="cta" href="${esc(v.url)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(v.provider)}" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}" data-ga-page-type="work" data-ga-position="${index + 1}">${archived ? `${esc(ctaText(v.provider))} ↗` : workCtaHtml(v.provider)}</a>`).join(' ');
    const endButtons = partners.map((v, index) =>
      `<a class="cta" href="${esc(v.url)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(v.provider)}" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}" data-ga-page-type="work_end" data-ga-position="${index + 1}">${archived ? `${esc(ctaText(v.provider))} ↗` : workCtaHtml(v.provider)}</a>`).join(' ');
    const notesFor = partners.map(v => PARTNER_NOTES[v.provider]).filter(Boolean);
    const vodSection = vods.length
      ? `<h2>${archived ? `配信していたサービス（${esc(asOf)}時点）` : '配信しているサービス'}</h2>
<p>${esc(names.join('、'))}</p>
${others.length && partners.length ? `<p class="note">リンクは提携しているサービスだけに付けています。</p>` : ''}
<p class="note">見放題・レンタルの区別や配信開始日は、各サービスでご確認ください。</p>`
      : '';
    const castSection = castHtml({ id, title: work.title, past: ctx.past, cast, countOf: actor => new Set(actor.roles.map(r => r.work_id)).size, note: archived ? '名前を押すと、その声優の最新の出演作と配信先を見られます。' : '名前を押すと、その声優の今期の出演作と配信先をまとめて見られます。', pageType: 'work', countPrefix: archived ? `${seasonLabel.replace(/アニメ$/, '')} ` : '今期' });
    const costarSection = costarHtml({ id, title: work.title, related, works: data.works, heading: archived ? `このキャストが、${seasonLabel}でほかに出ていた作品` : 'このキャストが、今期ほかに出ている作品', what: `${seasonLabel}`, pageType: 'work' });

    const body = `<h1>「${esc(work.title)}」の声優・キャスト${archived ? `（${esc(seasonLabel)}）` : 'と配信先'}</h1>
<p class="lead">${lead}</p>
${buttons ? `<p class="top-cta">${buttons}</p>
${notesFor.map(note => `<p class="note">${esc(note)}</p>`).join('\n')}` : ''}
${castSection}
${ownerSection(work.title)}
${costarSection}
${prevSection({ ctx, id, work, pageType: 'work_prev' })}
${vodSection}
${notesSection(notes[work.title], work.title)}
${work.official_url ? `<p><a href="${esc(work.official_url)}" target="_blank" rel="noopener" data-ga-event="official_site_click" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}">公式サイト ↗</a></p>` : ''}
${endButtons ? `<div class="end-cta"><p>「${esc(work.title)}」を見るなら</p>
<p>${endButtons}</p>
${notesFor.map(note => `<p class="note">${esc(note)}</p>`).join('\n')}</div>` : ''}
<h2>このページについて</h2>
<p class="note">作品とキャストはアニメ作品データベース「Annict」のAPI、配信先はAnnictの作品情報・公式サイト・配信サービスの公式ラインナップなどをもとにしています（最終更新：${esc(asOf)}）。配信状況は変わることがあります。</p>`;
    const description = archived
      ? `${castLead(work.title, cast).replace('」の', `」（${seasonLabel}）の`)}${seasonStartText(data.season)}。キャストが出ていた${seasonLabel}のほかの作品もまとめています。`
      : vods.length
        ? `${castLead(work.title, cast)}${names.slice(0, 3).join('、')}${names.length > 3 ? `など${names.length}サービス` : ''}で配信中。キャストが出ている${seasonLabel}のほかの作品もまとめています。`
        : `${castLead(work.title, cast)}キャストが出ている${seasonLabel}のほかの作品もまとめています。配信サービスは確認中です。`;
    // 配信先が確認できていない作品は検索に出さない（中身の薄いページを増やさないため）
    const indexed = vods.length > 0;
    const html = page({ ...ctx, path: `/work/${id}/`, title: archived ? `「${work.title}」声優・キャスト一覧（${seasonLabel}）` : `「${work.title}」声優・キャスト一覧と配信先`, description, body, noindex: !indexed, jsonLd: workJsonLd({ origin: ctx.origin, id, work, cast, listName: archived ? `${seasonLabel} 声優・キャストまとめ` : `${seasonLabel} 作品一覧`, listPath: archived ? `/season/${data.season}/` : '/work/' }) });
    return { id, html, indexed };
  });
}

export function workIndexPage(ctx) {
  const { data, seasonLabel } = ctx;
  const byWork = castOf(data);
  const works = Object.entries(data.works).sort((a, b) => a[1].title.localeCompare(b[1].title, 'ja'));
  const rows = works.map(([id, work]) => {
    const vods = (work.vod_links ?? []).map(v => label(v.provider));
    return `<tr><td><a href="/work/${esc(id)}/">${esc(work.title)}</a><div class="works">${vods.length ? esc(vods.join('・')) : '配信確認中'}</div></td><td class="num">${(byWork.get(id) ?? []).length}名</td></tr>`;
  }).join('\n');
  const withVod = works.filter(([, w]) => w.vod_links?.length).length;
  const title = `${seasonLabel} 作品一覧：配信はどこで見られる？`;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">${esc(seasonLabel)}のテレビアニメ${works.length}作品の、配信サービスとキャストの一覧です。配信先が確認できているのは${withVod}作品です。作品名を押すと、配信サービスとキャスト、同じ声優が出ているほかの作品を確認できます。</p>
<table>
<thead><tr><th>作品・配信サービス</th><th>キャスト</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
  const description = `${seasonLabel}のテレビアニメ${works.length}作品が、どの配信サービスで見られるかの一覧。キャストと、同じ声優が出ている作品も確認できます。`;
  return page({ ...ctx, path: '/work/', title, description, body });
}

// ---- 来期（data-next.json）のページ ----

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// '2027-01-08' → '1月8日（金）'。不正な値は null
export function startLabel(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日（${weekday}）`;
}

// 放送開始までの日数（ブラウザーで計算する）。data-start に放送開始日を入れた要素に表示する
const COUNTDOWN_SCRIPT = `<script>
document.querySelectorAll('[data-start]').forEach(el => {
  const days = Math.ceil((Date.parse(el.dataset.start + 'T00:00:00+09:00') - Date.now()) / 864e5);
  el.textContent = days > 1 ? 'あと' + days + '日' : days === 1 ? 'あす放送開始' : days === 0 ? 'きょう放送開始' : '放送中';
});
</script>
`;
const countdown = date => (startLabel(date) ? `<span class="countdown" data-start="${esc(date)}"></span>` : '');

// 放送日順（未定は最後、同日はタイトル順）
function byStart([, a], [, b]) {
  return (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999') || a.title.localeCompare(b.title, 'ja');
}

// 今期のデータ（data.json）の声優ごとの出演作品数
function currentCounts(data) {
  const counts = new Map();
  // サイトに載せている（配信先のある）作品だけ数える
  for (const actor of data?.voice_actors ?? []) {
    const count = new Set(actor.roles.filter(r => data.works[r.work_id]?.vod_links?.length).map(r => r.work_id)).size;
    if (count) counts.set(actor.actor_id, count);
  }
  return counts;
}

// skipIds: 今期の作品と同じIDの作品（同じタイトル）は、今期のページを優先して作らない
export function nextWorkPages(ctx, next, skipIds = new Set()) {
  const nextLabel = ctx.seasonLabelOf(next.season);
  const byWork = castOf(next);
  const counts = currentCounts(ctx.data);
  const asOf = next.updated_at.slice(0, 10);
  return Object.entries(next.works).filter(([id]) => !skipIds.has(id)).map(([id, work]) => {
    const cast = byWork.get(id) ?? [];
    const date = startLabel(work.start_date);
    const year = work.start_date?.slice(0, 4);
    const shared = new Map();
    for (const { actor } of cast) {
      for (const role of actor.roles) {
        if (role.work_id === id) continue;
        if (!shared.has(role.work_id)) shared.set(role.work_id, new Set());
        shared.get(role.work_id).add(actor.name);
      }
    }
    const related = [...shared.entries()]
      .sort((a, b) => b[1].size - a[1].size || next.works[a[0]].title.localeCompare(next.works[b[0]].title, 'ja'))
      .slice(0, 10);
    const lead = date
      ? `「${esc(work.title)}」は、${esc(year)}年${esc(date)}から放送開始予定です。${countdown(work.start_date)}`
      : `「${esc(work.title)}」は${esc(nextLabel)}として放送予定です。放送日はまだ確認できていません。`;
    const castSection = castHtml({ id, title: work.title, past: ctx.past, cast, countOf: actor => counts.get(actor.actor_id), note: `名前を押すと、その声優の今期（${ctx.seasonLabel}）の出演作と来期の出演予定をまとめて見られます。`, pageType: 'next_work' });
    const costarSection = costarHtml({ id, title: work.title, related, works: next.works, heading: 'このキャストが、来期ほかに出る作品', what: `${nextLabel}`, pageType: 'next_work' });
    const body = `<h1>「${esc(work.title)}」の声優・キャストと放送日（${esc(nextLabel)}）</h1>
<p class="lead">${lead}</p>
${castSection}
${ownerSection(work.title)}
${costarSection}
${prevSection({ ctx, id, work, pageType: 'next_work_prev' })}
<h2>配信</h2>
<p>配信サービスは発表待ちです。発表され次第、このページに追加します。</p>
${notesSection(ctx.notes?.[work.title], work.title)}
${work.official_url ? `<p><a href="${esc(work.official_url)}" target="_blank" rel="noopener" data-ga-event="official_site_click" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}">公式サイト ↗</a></p>` : ''}
<p><a href="/next/">${esc(nextLabel)}の放送日一覧へ</a></p>
<h2>このページについて</h2>
<p class="note">作品・キャスト・放送日はアニメ作品データベース「Annict」のAPIなどをもとにしています（最終更新：${esc(asOf)}）。放送前の情報のため、変更されることがあります。</p>`;
    const description = `${castLead(`${work.title}`, cast).replace('」の', `」（${nextLabel}）の`)}${date ? `${date}放送開始` : '放送日は未定'}です。同じ声優が来期に出るほかの作品もまとめています。`;
    // キャストが発表済みの作品だけ検索に出す（配信先はまだなくてよい）
    const indexed = cast.length > 0;
    const html = page({ ...ctx, path: `/work/${id}/`, title: `「${work.title}」声優・キャスト一覧と放送日（${nextLabel}）`, description, body, noindex: !indexed, extraScript: COUNTDOWN_SCRIPT, jsonLd: workJsonLd({ origin: ctx.origin, id, work, cast, listName: `${nextLabel} 放送日とキャスト`, listPath: '/next/' }) });
    return { id, html, indexed };
  });
}

// 最近発表されたキャスト（data/next-cast-log.json。毎週の更新で増えた分）
// 最近加わったキャスト。直近の更新分を目立つ枠で（有名な声優＝今期・来期の出演が多い順に5人）、残りと過去14日分は「すべて見る」で開く
function newCastSection(next, castLog, data, days = 14) {
  if (!castLog?.entries?.length || castLog.season !== next.season) return '';
  const latest = castLog.entries.reduce((max, e) => (e.date > max ? e.date : max), '');
  const from = new Date(Date.parse(latest) - days * 864e5).toISOString().slice(0, 10);
  const recent = castLog.entries.filter(e => e.date > from && next.works[e.work_id]);
  if (!recent.length) return '';
  const workCount = new Map();
  for (const d of [data, next]) for (const a of d?.voice_actors ?? []) workCount.set(a.actor_id, (workCount.get(a.actor_id) ?? 0) + new Set(a.roles.map(r => r.work_id)).size);
  const newest = recent.filter(e => e.date === latest);
  const seen = new Set();
  const picks = [...newest].sort((a, b) => (workCount.get(b.actor_id) ?? 0) - (workCount.get(a.actor_id) ?? 0))
    .filter(e => !seen.has(e.actor_id) && seen.add(e.actor_id)).slice(0, 5);
  const [, lm, ld] = latest.split('-').map(Number);
  const byDate = new Map();
  for (const e of recent) {
    if (!byDate.has(e.date)) byDate.set(e.date, new Map());
    const works = byDate.get(e.date);
    if (!works.has(e.work_id)) works.set(e.work_id, []);
    works.get(e.work_id).push(e);
  }
  const blocks = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, works]) => {
    const [, m, d] = date.split('-').map(Number);
    const items = [...works.entries()].map(([workId, entries]) =>
      `<li><a href="/work/${esc(workId)}/">${esc(next.works[workId].title)}</a>：${entries.slice(0, 8).map(e => `${esc(e.character)}（<a href="/va/${toPageId(e.actor_id)}/">${esc(e.name)}</a>）`).join('、')}${entries.length > 8 ? ` ほか${entries.length - 8}名` : ''}</li>`).join('\n');
    return `<h3>${m}月${d}日の更新で追加</h3>\n<ul>\n${items}\n</ul>`;
  }).join('\n');
  return `<section class="newcast" aria-labelledby="newcast-h">
<h2 id="newcast-h">新しく加わったキャスト（${lm}/${ld}の更新・${newest.length}人）</h2>
<p>毎週月曜の更新で、新しく確認できたキャストです。名前を押すと、その声優の出演作を見られます。</p>
<ul class="newcast-top">
${picks.map((e, i) => `<li><a href="/va/${toPageId(e.actor_id)}/" data-ga-event="cast_click" data-ga-work-id="${esc(e.work_id)}" data-ga-actor-id="${esc(e.actor_id)}" data-ga-position="${i + 1}" data-ga-page-type="next_newcast"><b>${esc(e.name)}</b>　${esc(e.character)}${/ナレーション$/.test(e.character) ? '' : ' 役'}</a><span>${esc(next.works[e.work_id].title)}</span></li>`).join('\n')}
</ul>
<details><summary>すべて見る（直近${days}日分）</summary>
${blocks}
</details>
</section>`;
}

export function nextIndexPage(ctx, next, castLog = null) {
  if (!next) {
    return page({ ...ctx, path: '/next/', title: '来期アニメの放送日とキャスト', noindex: true,
      description: '来期のアニメの放送日とキャストは、発表され次第このページにまとめます。',
      body: '<h1>来期アニメの放送日とキャスト</h1>\n<p class="lead">来期のアニメの情報は準備中です。キャストが発表され次第、このページにまとめます。</p>' });
  }
  const nextLabel = ctx.seasonLabelOf(next.season);
  const byWork = castOf(next);
  const works = Object.entries(next.works).sort(byStart);
  const dated = works.filter(([, w]) => startLabel(w.start_date)).length;
  // 来期の出演が多い声優（声優ページへの入口）
  const busy = next.voice_actors
    .map(actor => ({ actor, n: new Set(actor.roles.map(r => r.work_id)).size }))
    .filter(x => x.n >= 2)
    .sort((x, y) => y.n - x.n || x.actor.reading.localeCompare(y.actor.reading, 'ja'))
    .slice(0, 8);
  const busyHtml = busy.length ? `<h2>来期の出演が多い声優</h2>
<p class="note"><a href="/next/ranking/">${esc(nextLabel)}の声優 出演本数ランキングを見る ›</a></p>
<div class="chips-va">${busy.map(({ actor, n }, i) => `<a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="ranking_click" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${i + 1}" data-ga-page-type="next_busy">${esc(actor.name)}<em>${n}作品</em></a>`).join('')}</div>` : '';
  const item = ([id, work]) => {
    const cast = byWork.get(id) ?? [];
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(work.start_date ?? '');
    const date = startLabel(work.start_date);
    const prev = ctx.prevSeasons?.[work.title] && ctx.partnerLinks?.[ctx.prevSeasons[work.title].provider];
    const names = cast.slice(0, 4).map(({ actor }, i) => `<a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="cast_click" data-ga-work-id="${esc(id)}" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${i + 1}" data-ga-page-type="next_index">${esc(actor.name)}</a>`);
    // タイトルプレート（ジャンルの色・柄と作品名）と、作品紹介のキャッチコピー
    const thumb = miniPlate(work.title, `/work/${id}/`);
    const catchCopy = ctx.notes?.[work.title]?.catch;
    return `<li>${thumb}<div><span class="sched-day">${date ? `${Number(match[1])}/${Number(match[2])}${esc(date.slice(-3))}${countdown(work.start_date)}` : '放送日未定'}</span>${genreChip(work.title)}<a class="sched-title" href="/work/${esc(id)}/">${esc(work.title)}</a>${catchCopy ? `<div class="sched-catch">${esc(catchCopy)}</div>` : ''}<div class="sched-cast">${cast.length ? `${names.join('、')}${cast.length > 4 ? ` ほか${cast.length - 4}名` : ''}` : 'キャスト未発表'}</div>${prev ? `<a class="sched-chip" href="/work/${esc(id)}/#prev-h">前のシーズンはPrime Videoで</a>` : ''}</div></li>`;
  };
  const groups = new Map();
  for (const entry of works) {
    const m = /^\d{4}-(\d{2})/.exec(entry[1].start_date ?? '');
    const key = m && startLabel(entry[1].start_date) ? `${Number(m[1])}月から放送` : '放送日未定';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const schedule = [...groups.entries()].map(([key, list]) => `<h3 class="month">${esc(key)}（${list.length}作品）</h3>
<ul class="sched">
${list.map(item).join('\n')}
</ul>`).join('\n');
  const title = `${nextLabel} 声優・キャスト一覧と放送日`;
  const first = works.find(([, w]) => startLabel(w.start_date));
  const body = `<h1>${esc(title)}</h1>
<p class="lead">${esc(nextLabel)}の${works.length}作品を、放送開始日の順にまとめました。声優の名前を押すと、その声優の今期の出演作と来期の出演予定を見られます。</p>
${newCastSection(next, castLog, ctx.data)}
${busyHtml}
<h2>放送日の一覧</h2>
${schedule}
<p class="note">放送日が確認できているのは${dated}作品です。放送前の情報のため、変更されることがあります（最終更新：${esc(next.updated_at.slice(0, 10))}）。声優名での検索は<a href="/">トップ</a>から。</p>`;
  const description = `${nextLabel}の${works.length}作品を放送開始日の順にまとめた一覧。${first ? `最初の放送は${startLabel(first[1].start_date)}の「${first[1].title}」。` : ''}キャストと、声優ごとの来期の出演予定も確認できます。`;
  return page({ ...ctx, path: '/next/', title, description, body, extraScript: COUNTDOWN_SCRIPT });
}

// ---- 特集：今期よく共演している声優コンビ ----
export function costarPairsPage(ctx) {
  const { data, seasonLabel } = ctx;
  const MIN = 3;
  const SHOWN = 5; // 最初に見せる組数（残りは畳む）
  // 作品ごとに、声優と役名
  const byWork = new Map();
  for (const actor of data.voice_actors) {
    for (const role of actor.roles) {
      if (!byWork.has(role.work_id)) byWork.set(role.work_id, new Map());
      const cast = byWork.get(role.work_id);
      if (!cast.has(actor.actor_id)) cast.set(actor.actor_id, { actor, roles: [] });
      cast.get(actor.actor_id).roles.push(role.character_name);
    }
  }
  const pairs = new Map();
  for (const [workId, cast] of byWork) {
    const ids = [...cast.keys()].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        if (!pairs.has(key)) pairs.set(key, { a: cast.get(ids[i]).actor, b: cast.get(ids[j]).actor, works: [] });
        pairs.get(key).works.push({ workId, ra: cast.get(ids[i]).roles, rb: cast.get(ids[j]).roles });
      }
    }
  }
  const list = [...pairs.values()].filter(p => p.works.length >= MIN)
    .sort((x, y) => y.works.length - x.works.length || x.a.reading.localeCompare(y.a.reading, 'ja') || x.b.reading.localeCompare(y.b.reading, 'ja'));
  const actorLink = (actor, index, side) => `<a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="ranking_click" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${index + 1}" data-ga-page-type="costar_pair_${side}">${esc(actor.name)}</a>`;
  const card = (p, index) => `<li><div class="pair-h"><span class="pair-names">${actorLink(p.a, index, 'a')}<i>×</i>${actorLink(p.b, index, 'b')}</span><span class="pair-n">${p.works.length}作品で共演</span></div>
<ul class="pair-works">${p.works.map(w => `<li><a href="/work/${esc(w.workId)}/">${esc(data.works[w.workId]?.title ?? '')}</a> <span>${esc(p.a.name)}：${esc(w.ra.join('／'))}、${esc(p.b.name)}：${esc(w.rb.join('／'))}</span></li>`).join('')}</ul></li>`;
  const most = list[0];
  const title = `${seasonLabel} よく共演している声優コンビ`;
  const description = `${seasonLabel}のテレビアニメで、${MIN}作品以上で共演している声優の組み合わせ${list.length}組をまとめました。${most ? `最多は${most.a.name}さんと${most.b.name}さんの${most.works.length}作品。` : ''}共演作と役名も確認できます。`;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">今期、同じ作品で何度も顔を合わせている声優は？ ${esc(seasonLabel)}の作品で${MIN}作品以上共演している${list.length}組を、共演の多い順に並べました（上位5組を表示）。名前を押すとその声優の出演作と配信先、作品名を押すと作品ページを見られます。</p>
${list.length ? `<ol class="pair top">
${list.slice(0, SHOWN).map(card).join('\n')}
</ol>
${list.length > SHOWN ? `<details><summary>6位以降の${list.length - SHOWN}組を見る</summary>
<ol class="pair" start="${SHOWN + 1}">
${list.slice(SHOWN).map((p, i) => card(p, i + SHOWN)).join('\n')}
</ol>
</details>` : ''}` : '<p>今期はまだ、3作品以上で共演している組み合わせがありません。</p>'}
<h2>集計について</h2>
<p class="note">掲載している${esc(seasonLabel)}のテレビアニメ${Object.keys(data.works).length}作品のキャストから、同じ作品に出ている声優の組み合わせを数えました（劇場版などもデータにあれば含みます）。役名はアニメ作品データベース「Annict」の登録にもとづきます（最終更新：${esc(data.updated_at.slice(0, 10))}）。放送開始後にキャストが追加される作品もあるため、数は変わることがあります。</p>`;
  return page({ ...ctx, path: '/costar/', title, description, body });
}

// ---- 特集：続編ガイド（前のシーズンを見られる場所）----
export function sequelGuidePage(ctx, next) {
  const { data, seasonLabel } = ctx;
  const nextLabel = next ? ctx.seasonLabelOf(next.season) : '';
  const idOf = new Map();
  for (const [id, w] of Object.entries(next?.works ?? {})) idOf.set(w.title, { id, work: w, when: 'next' });
  for (const [id, w] of Object.entries(data.works)) idOf.set(w.title, { id, work: w, when: 'current' });
  const items = Object.entries(ctx.prevSeasons ?? {})
    .map(([title, entry]) => ({ title, entry, ...(idOf.get(title) ?? {}) }))
    .filter(x => x.id && ctx.partnerLinks?.[x.entry.provider]);
  const card = (x, index) => {
    const url = ctx.partnerLinks[x.entry.provider];
    const before = ctx.notes?.[x.title]?.before;
    const date = startLabel(x.work.start_date);
    return `<li><div class="seq-head">${miniPlate(x.title, `/work/${x.id}/`, x.entry.series)}<div>${genreChip(x.title, ' seq-genre')}<div class="seq-title"><a href="/work/${esc(x.id)}/">${esc(x.title)}</a></div>
${x.when === 'next' && date ? `<p class="note">${esc(date)}から放送開始予定 ${countdown(x.work.start_date)}</p>` : ''}</div></div>
<div class="seq-prev">前に見ておく：<b>${esc(x.entry.series)}</b>の${esc(x.entry.label)}<br>${esc(label(x.entry.provider))}で、プライム会員なら追加料金なしで見られます（${esc(x.entry.checked)}時点）。</div>
${before ? `<p class="note">${esc(before)}</p>` : ''}
<a class="cta" href="${esc(url)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(x.entry.provider)}" data-ga-work-id="${esc(x.id)}" data-ga-work-title="${esc(x.title)}" data-ga-page-type="sequel_guide" data-ga-position="${index + 1}">${esc(ctaText(x.entry.provider))} ↗</a></li>`;
  };
  const current = items.filter(x => x.when === 'current').sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  const upcoming = items.filter(x => x.when === 'next').sort((a, b) => (a.work.start_date ?? '9999').localeCompare(b.work.start_date ?? '9999') || a.title.localeCompare(b.title, 'ja'));
  const providers = [...new Set(items.map(x => x.entry.provider))];
  const note = providers.map(p => PARTNER_NOTES[p]).filter(Boolean);
  const title = `続編アニメの前に見ておきたい作品と見られる場所（${seasonLabel}${nextLabel ? `・${nextLabel}` : ''}）`;
  const description = `${seasonLabel}${nextLabel ? `と${nextLabel}` : ''}の続編アニメ${items.length}作品について、前に見ておきたいシーズンと、追加料金なしで見られる配信サービスをまとめました。`;
  let n = 0;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">2期・3期から見始める前に、前のシーズンを見ておきたい人へ。続編${items.length}作品について、前に見ておくシーズンと、どこで見られるかをまとめました。</p>
${note.map(t => `<p class="note">${esc(t)}</p>`).join('\n')}
${upcoming.length ? `<h2>${esc(nextLabel)}の続編（放送前に見ておく）</h2>
<ol class="seq">
${upcoming.map(x => card(x, n++)).join('\n')}
</ol>` : ''}
${current.length ? `<h2>${esc(seasonLabel)}の続編（放送中）</h2>
<ol class="seq">
${current.map(x => card(x, n++)).join('\n')}
</ol>` : ''}
<h2>このページについて</h2>
<p class="note">前のシーズンが、各サービスの作品ページで追加料金なしで見られる（第1話だけ・数話だけのお試しではない）ことを確かめた作品だけを載せています。確かめた日付は各作品に書いています。配信状況は変わることがあるので、最新の情報は各サービスで確認してください。</p>`;
  return page({ ...ctx, path: '/sequel/', title, description, body, extraScript: COUNTDOWN_SCRIPT });
}

// ---- シーズンのまとめ（/season/<シーズン>/）----
// 放送中も終わったあとも同じ URL で残す。「今期」などの時間で変わる言い方は使わない。
export function seasonPage(ctx) {
  const { data, seasonLabel } = ctx;
  const archived = Boolean(ctx.archived);
  const byWork = castOf(data);
  const asOf = data.updated_at.slice(0, 10);
  const works = Object.entries(data.works).sort((a, b) => a[1].title.localeCompare(b[1].title, 'ja'));
  const counts = data.voice_actors
    .map(actor => ({ actor, n: new Set(actor.roles.map(r => r.work_id)).size }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || a.actor.reading.localeCompare(b.actor.reading, 'ja'));
  const top = counts.slice(0, 10);
  const workItem = ([id, work]) => {
    const cast = byWork.get(id) ?? [];
    return `<li><a class="sched-title" href="/work/${esc(id)}/">${esc(work.title)}</a><div class="sched-cast">${cast.length ? `${esc(castPairs(cast, 3))}${cast.length > 3 ? ` ほか${cast.length - 3}名` : ''}` : 'キャスト未発表'}</div></li>`;
  };
  const title = `${seasonLabel} 声優・キャストまとめ（全${works.length}作品）`;
  const description = `${seasonLabel}（${seasonStartText(data.season)}）のテレビアニメ${works.length}作品の声優・キャストをまとめました。${top[0] ? `出演作がいちばん多かったのは${top[0].actor.name}さん（${top[0].n}作品）。` : ''}`;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">${esc(seasonLabel)}（${esc(seasonStartText(data.season))}）のテレビアニメ${works.length}作品の主な声優・キャストをまとめました。作品名を押すと、全キャストと配信先${archived ? `（${esc(asOf)}時点）` : ''}を見られます。</p>
<h2>出演作の多い声優</h2>
<div class="chips-va">${top.map(({ actor, n }, i) => `<a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="ranking_click" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${i + 1}" data-ga-page-type="season">${esc(actor.name)}<em>${n}作品</em></a>`).join('')}</div>
<h2>作品とキャスト（${works.length}作品）</h2>
<ul class="sched season-list">
${works.map(workItem).join('\n')}
</ul>
<h2>このページについて</h2>
<p class="note">作品とキャストはアニメ作品データベース「Annict」のAPIをもとにしています（${archived ? '最終確認' : '最終更新'}：${esc(asOf)}）。キャストは主な3名を、データの登録順（主役級を先にしたもの）で載せています。</p>`;
  return page({ ...ctx, path: `/season/${data.season}/`, title, description, body });
}
