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
.rk a{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 12px;align-items:center;padding:11px 14px;border:1px solid #e3dcef;border-radius:14px;background:#fff;color:inherit;text-decoration:none}
.rk a:hover{border-color:#62517f}
.rk-no{grid-row:1/3;min-width:2.4em;text-align:center;font-size:18px;font-weight:900;color:#62517f;line-height:1}.rk-no small{font-size:11px;margin-left:1px}
.rk-name{font-size:16px;font-weight:900;color:#1d2a44;line-height:1.35}
.rk-works{grid-column:2;color:#5d5a52;font-size:12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rk-n{grid-column:3;grid-row:1/3;padding:4px 10px;border-radius:999px;background:#efebf5;color:#62517f;font-size:13px;font-weight:800;white-space:nowrap}
.rk.top a{padding:16px;border-width:2px}.rk.top .rk-no{font-size:30px}.rk.top .rk-name{font-size:20px}.rk.top .rk-n{background:#62517f;color:#fff;font-size:14px}
.rk .r1 a{border-color:#F5C542;background:#fffaea}.rk .r1 .rk-no{color:#b8860b}
.rk .r2 a{border-color:#c4c8d0;background:#f7f8fa}.rk .r2 .rk-no{color:#7d8592}
.rk .r3 a{border-color:#ddb08a;background:#fdf6f0}.rk .r3 .rk-no{color:#a86a3d}
.month{margin:22px 0 6px;font-size:15px;font-weight:900;color:#62517f}
.sched{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sched>li{display:grid;grid-template-columns:62px minmax(0,1fr);gap:12px;padding:12px 14px;border:1px solid #e3dcef;border-radius:14px;background:#fff}
.sched-date{text-align:center;font-weight:900;color:#1d2a44;font-size:15px;line-height:1.25}.sched-date small{display:block;font-size:11px;color:#62517f;font-weight:700}.sched-date .countdown{display:block;margin-top:4px;font-size:10px;color:#5d5a52;font-weight:700}
.sched-title{display:block;font-weight:800;font-size:15px;line-height:1.4;color:#1d2a44;text-decoration:none}
.sched-cast{margin-top:3px;font-size:12.5px;color:#5d5a52;line-height:1.6}.sched-cast a{color:#62517f;font-weight:700;text-decoration:none;border-bottom:1px solid #d6cde6}
.sched-chip{display:inline-block;margin-top:6px;padding:2px 9px;border-radius:999px;background:#F5C542;color:#1d2a44;font-size:11px;font-weight:800;text-decoration:none}
.chips-va{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}.chips-va a{display:inline-flex;align-items:baseline;gap:5px;padding:7px 12px;border:1px solid #e3dcef;border-radius:999px;background:#fff;color:#1d2a44;font-weight:800;font-size:14px;text-decoration:none}.chips-va a em{font-style:normal;font-size:11px;color:#62517f}
.prev{margin:22px 0 8px;padding:14px 16px;border:1px solid #e3dcef;border-radius:14px;background:#f8f6fc}.prev h2{margin:0 0 6px}.prev p{margin:6px 0}
details.notes summary{margin-top:2px}
`;

function page({ origin, ogImage, aboutHtml, path, title, description, body, noindex = false, extraScript = '', jsonLd = null }) {
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
<div class="related">
<p><strong>関連ページ</strong></p>
<ul>
<li><a href="/">声優名で今期の出演作を検索する</a></li>
<li><a href="/ranking/">今期の出演本数ランキング</a></li>
<li><a href="/vod/">配信サービス別の作品数</a></li>
<li><a href="/work/">今期の作品一覧（配信はどこ？）</a></li>
<li><a href="/next/">来期アニメの放送日とキャスト</a></li>
<li><a href="/about/">このサイトについて</a></li>
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

export function rankingPage(ctx) {
  const { data, seasonLabel } = ctx;
  const actors = data.voice_actors
    .map(actor => ({ actor, count: new Set(actor.roles.map(role => role.work_id)).size }))
    .sort((a, b) => b.count - a.count || a.actor.reading.localeCompare(b.actor.reading, 'ja'));
  const total = actors.length;
  const multi = actors.filter(a => a.count >= 2).length;
  const three = actors.filter(a => a.count >= 3).length;
  const average = (actors.reduce((sum, a) => sum + a.count, 0) / total).toFixed(2);
  const threshold = 5;
  const ranked = rankRows(actors.filter(a => a.count >= threshold), a => a.count);
  const top = ranked[0]?.item;
  const workTitle = id => data.works[id]?.title ?? '';

  const card = ({ rank, item: { actor, count } }, index) => {
    const seen = new Set();
    const titles = actor.roles.filter(role => !seen.has(role.work_id) && seen.add(role.work_id)).map(role => workTitle(role.work_id));
    return `<li class="r${rank}"><a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="ranking_click" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${index + 1}" data-ga-page-type="ranking"><span class="rk-no">${rank}<small>位</small></span><span class="rk-name">${esc(actor.name)}</span><span class="rk-works">${esc(titles.join('、'))}</span><span class="rk-n">${count}作品 ›</span></a></li>`;
  };
  const topRows = ranked.filter(r => r.rank <= 3);
  const restRows = ranked.filter(r => r.rank > 3);

  const title = `${seasonLabel}の声優 出演本数ランキング`;
  const description = `${seasonLabel}のテレビアニメに出演している声優${total}名を、出演作品数で集計したランキングです。${top ? `1位は${top.actor.name}さん（${top.count}作品）。` : ''}出演作と役名、配信サービスも確認できます。`;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">今期いちばん多くの作品に出ている声優は？ ${esc(seasonLabel)}の出演作品数で並べました。名前を押すと、出演作と役名、配信サービスを見られます。</p>
<ol class="rk top">
${topRows.map((r, i) => card(r, i)).join('\n')}
</ol>
${restRows.length ? `<h2>${restRows[0].rank}位から（${threshold}作品以上）</h2>
<ol class="rk">
${restRows.map((r, i) => card(r, topRows.length + i)).join('\n')}
</ol>` : ''}

<h2>集計について</h2>
<p class="note">掲載している${esc(seasonLabel)}のテレビアニメ${Object.keys(data.works).length}作品のキャストから、声優ごとの出演作品数を数えました。掲載している声優は${total}名で、2作品以上に出ているのは${multi}名（${Math.round((multi / total) * 100)}%）、3作品以上は${three}名、1人あたりの平均は${average}作品です。同じ作品で複数の役を演じている場合は1作品として数えています。</p>
<p class="note">作品とキャストの情報は、アニメ作品データベース「Annict」のAPIをもとにしています（最終更新：${esc(data.updated_at.slice(0, 10))}）。放送開始後にキャストが追加される作品もあるため、数は変わることがあります。</p>`;
  return page({ ...ctx, path: '/ranking/', title, description, body });
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
function castOf(data) {
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
  // 公式のクレジット順（character_id の末尾の連番。1 が主人公）に並べる
  const order = actor => Math.min(...actor.roles.map(r => Number(String(r.character_id ?? '').split('-').pop()) || Infinity));
  for (const [workId, list] of byWork) {
    const rank = c => order({ roles: c.actor.roles.filter(r => r.work_id === workId) });
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

function castHtml({ id, title, cast, countOf, note, pageType, past }) {
  if (!cast.length) return '';
  const item = ({ actor, roles }, index) => {
    const count = countOf(actor);
    const rep = repWork(past, actor.actor_id, title);
    return `<li><a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="cast_click" data-ga-work-id="${esc(id)}" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${index + 1}" data-ga-page-type="${esc(pageType)}"><span class="cast-name">${esc(actor.name)}</span><span class="cast-role">${esc(roles.join('／'))}${/ナレーション$/.test(roles.at(-1) ?? '') ? '' : ' 役'}</span>${rep ? `<span class="cast-rep">主な出演：${esc(rep.character)}（${esc(rep.title)}）</span>` : ''}<span class="cast-n">${count ? `今期${count}作品 ›` : '›'}</span></a></li>`;
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

export function workPages(ctx) {
  const { data, seasonLabel, partnerServices } = ctx;
  const notes = ctx.notes ?? {};
  const byWork = castOf(data);
  const asOf = data.updated_at.slice(0, 10);
  return Object.entries(data.works).map(([id, work]) => {
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

    const lead = vods.length
      ? `${esc(names.length > 3 ? `${names.slice(0, 3).join('、')}など${names.length}サービス` : names.join('、'))}で配信中です（${esc(asOf)}時点）。`
      : `「${esc(work.title)}」の配信サービスは、まだ確認できていません（${esc(asOf)}時点）。配信が決まり次第、このページに追加します。`;
    const buttons = partners.map((v, index) =>
      `<a class="cta" href="${esc(v.url)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(v.provider)}" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}" data-ga-page-type="work" data-ga-position="${index + 1}">${esc(ctaText(v.provider))} ↗</a>`).join(' ');
    const endButtons = partners.map((v, index) =>
      `<a class="cta" href="${esc(v.url)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(v.provider)}" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}" data-ga-page-type="work_end" data-ga-position="${index + 1}">${esc(ctaText(v.provider))} ↗</a>`).join(' ');
    const notesFor = partners.map(v => PARTNER_NOTES[v.provider]).filter(Boolean);
    const vodSection = vods.length
      ? `<h2>配信しているサービス</h2>
<p>${esc(names.join('、'))}</p>
${others.length && partners.length ? `<p class="note">リンクは提携しているサービスだけに付けています。</p>` : ''}
<p class="note">見放題・レンタルの区別や配信開始日は、各サービスでご確認ください。</p>`
      : '';
    const castSection = castHtml({ id, title: work.title, past: ctx.past, cast, countOf: actor => new Set(actor.roles.map(r => r.work_id)).size, note: '名前を押すと、その声優の今期の出演作と配信先をまとめて見られます。', pageType: 'work' });
    const costarSection = costarHtml({ id, title: work.title, related, works: data.works, heading: 'このキャストが、今期ほかに出ている作品', what: `${seasonLabel}`, pageType: 'work' });

    const body = `<h1>「${esc(work.title)}」の配信はどこ？</h1>
<p class="lead">${lead}</p>
${buttons ? `<p class="top-cta">${buttons}</p>
${notesFor.map(note => `<p class="note">${esc(note)}</p>`).join('\n')}` : ''}
${castSection}
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
    const description = vods.length
      ? `「${work.title}」は${names.slice(0, 4).join('、')}${names.length > 4 ? 'など' : ''}で配信中。キャスト${cast.length}名と、同じ声優が出ている${seasonLabel}のほかの作品もまとめています。`
      : `「${work.title}」のキャスト${cast.length}名と、同じ声優が出ている${seasonLabel}のほかの作品をまとめています。配信サービスは確認中です。`;
    // 配信先が確認できていない作品は検索に出さない（中身の薄いページを増やさないため）
    const indexed = vods.length > 0;
    const html = page({ ...ctx, path: `/work/${id}/`, title: `「${work.title}」の配信はどこ？見られるサービスとキャスト`, description, body, noindex: !indexed, jsonLd: workJsonLd({ origin: ctx.origin, id, work, cast, listName: `${seasonLabel} 作品一覧`, listPath: '/work/' }) });
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
    const body = `<h1>「${esc(work.title)}」（${esc(nextLabel)}）の放送日とキャスト</h1>
<p class="lead">${lead}</p>
${castSection}
${costarSection}
${prevSection({ ctx, id, work, pageType: 'next_work_prev' })}
<h2>配信</h2>
<p>配信サービスは発表待ちです。発表され次第、このページに追加します。</p>
${notesSection(ctx.notes?.[work.title], work.title)}
${work.official_url ? `<p><a href="${esc(work.official_url)}" target="_blank" rel="noopener" data-ga-event="official_site_click" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}">公式サイト ↗</a></p>` : ''}
<p><a href="/next/">${esc(nextLabel)}の放送日一覧へ</a></p>
<h2>このページについて</h2>
<p class="note">作品・キャスト・放送日はアニメ作品データベース「Annict」のAPIなどをもとにしています（最終更新：${esc(asOf)}）。放送前の情報のため、変更されることがあります。</p>`;
    const description = `「${work.title}」（${nextLabel}）は${date ? `${date}放送開始` : '放送日未定'}。キャスト${cast.length}名と、同じ声優が来期に出るほかの作品をまとめています。`;
    // キャストが発表済みの作品だけ検索に出す（配信先はまだなくてよい）
    const indexed = cast.length > 0;
    const html = page({ ...ctx, path: `/work/${id}/`, title: `「${work.title}」（${nextLabel}）の放送日とキャスト`, description, body, noindex: !indexed, extraScript: COUNTDOWN_SCRIPT, jsonLd: workJsonLd({ origin: ctx.origin, id, work, cast, listName: `${nextLabel} 放送日とキャスト`, listPath: '/next/' }) });
    return { id, html, indexed };
  });
}

// 最近発表されたキャスト（data/next-cast-log.json。毎週の更新で増えた分）
function newCastSection(next, castLog, days = 14) {
  if (!castLog?.entries?.length || castLog.season !== next.season) return '';
  const latest = castLog.entries.reduce((max, e) => (e.date > max ? e.date : max), '');
  const from = new Date(Date.parse(latest) - days * 864e5).toISOString().slice(0, 10);
  const recent = castLog.entries.filter(e => e.date > from && next.works[e.work_id]);
  if (!recent.length) return '';
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
  return `<h2>最近発表されたキャスト</h2>
<p>毎週の更新で、新しく確認できたキャストです（直近${days}日分）。</p>
${blocks}`;
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
<div class="chips-va">${busy.map(({ actor, n }, i) => `<a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="ranking_click" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${i + 1}" data-ga-page-type="next_busy">${esc(actor.name)}<em>${n}作品</em></a>`).join('')}</div>` : '';
  const item = ([id, work]) => {
    const cast = byWork.get(id) ?? [];
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(work.start_date ?? '');
    const date = startLabel(work.start_date);
    const prev = ctx.prevSeasons?.[work.title] && ctx.partnerLinks?.[ctx.prevSeasons[work.title].provider];
    const names = cast.slice(0, 4).map(({ actor }, i) => `<a href="/va/${toPageId(actor.actor_id)}/" data-ga-event="cast_click" data-ga-work-id="${esc(id)}" data-ga-actor-id="${esc(actor.actor_id)}" data-ga-position="${i + 1}" data-ga-page-type="next_index">${esc(actor.name)}</a>`);
    return `<li><div class="sched-date">${date ? `${Number(match[1])}/${Number(match[2])}<small>${esc(date.slice(-3))}</small>${countdown(work.start_date)}` : '未定'}</div><div><a class="sched-title" href="/work/${esc(id)}/">${esc(work.title)}</a><div class="sched-cast">${cast.length ? `${names.join('、')}${cast.length > 4 ? ` ほか${cast.length - 4}名` : ''}` : 'キャスト未発表'}</div>${prev ? `<a class="sched-chip" href="/work/${esc(id)}/#prev-h">前のシーズンはPrime Videoで</a>` : ''}</div></li>`;
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
${busyHtml}
${newCastSection(next, castLog)}
<h2>放送日の一覧</h2>
${schedule}
<p class="note">放送日が確認できているのは${dated}作品です。放送前の情報のため、変更されることがあります（最終更新：${esc(next.updated_at.slice(0, 10))}）。声優名での検索は<a href="/">トップ</a>から。</p>`;
  const description = `${nextLabel}の${works.length}作品を放送開始日の順にまとめた一覧。${first ? `最初の放送は${startLabel(first[1].start_date)}の「${first[1].title}」。` : ''}キャストと、声優ごとの来期の出演予定も確認できます。`;
  return page({ ...ctx, path: '/next/', title, description, body, extraScript: COUNTDOWN_SCRIPT });
}
