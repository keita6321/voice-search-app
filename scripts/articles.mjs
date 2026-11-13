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
.related{margin-top:40px;padding-top:16px;border-top:1px solid #e3dfd2}
`;

function page({ origin, ogImage, aboutHtml, path, title, description, body }) {
  const { style, scripts } = shellParts(aboutHtml);
  const url = `${origin}${path}`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f8f7f2">
<title>${esc(title)}｜ANIME CAST NOW</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="ANIME CAST NOW">
<meta property="og:image" content="${ogImage}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<style>${style}${EXTRA_STYLE}</style>
</head>
<body>
<main>
<p><a href="/">ANIME CAST NOW トップへ戻る</a></p>
${body}
<div class="related">
<p><strong>関連ページ</strong></p>
<ul>
<li><a href="/">声優名で今期の出演作を検索する</a></li>
<li><a href="/ranking/">今期の出演本数ランキング</a></li>
<li><a href="/vod/">配信サービス別の作品数</a></li>
<li><a href="/about/">このサイトについて</a></li>
</ul>
<p class="note">本ページのリンクにはアフィリエイトを含みます。配信状況は各サービスでご確認ください。</p>
</div>
</main>
${scripts}</body>
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

  const rows = ranked.map(({ rank, item: { actor, count } }) => {
    const seen = new Set();
    const works = actor.roles
      .filter(role => !seen.has(role.work_id) && seen.add(role.work_id))
      .map(role => `${esc(workTitle(role.work_id))}（${esc(role.character_name)}）`)
      .join('、');
    return `<tr><td class="rank">${rank}位</td><td><a href="/va/${toPageId(actor.actor_id)}/">${esc(actor.name)}</a><div class="works">${works}</div></td><td class="num">${count}作品</td></tr>`;
  }).join('\n');

  const title = `${seasonLabel}の声優 出演本数ランキング`;
  const description = `${seasonLabel}のテレビアニメに出演している声優${total}名を、出演作品数で集計したランキングです。${top ? `1位は${top.actor.name}さん（${top.count}作品）。` : ''}出演作と役名、配信サービスも確認できます。`;
  const body = `<h1>${esc(title)}</h1>
<p class="lead">今期はどの声優が、いくつの作品に出ているのか。ANIME CAST NOW に掲載している${esc(seasonLabel)}のテレビアニメ${Object.keys(data.works).length}作品のキャスト情報から、声優ごとの出演作品数を集計しました。</p>

<h2>今期のデータ</h2>
<ul>
<li>掲載している声優：${total}名</li>
<li>2作品以上に出演：${multi}名（${Math.round((multi / total) * 100)}%）</li>
<li>3作品以上に出演：${three}名</li>
<li>1人あたりの平均出演数：${average}作品</li>
</ul>
<p>${top ? `最も多かったのは${esc(top.actor.name)}さんで、${top.count}作品に出演しています。` : ''}半数以上の声優は今期1作品のみの出演で、複数の作品を掛け持ちしている声優は一部に集中しています。</p>

<h2>${threshold}作品以上に出演している声優</h2>
<p class="note">作品名の後ろのかっこ内は役名です。名前を押すと、各作品の配信サービスを確認できます。</p>
<table>
<thead><tr><th>順位</th><th>声優・出演作品</th><th>作品数</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>

<h2>集計について</h2>
<p class="note">作品とキャストの情報は、アニメ作品データベース「Annict」のAPIをもとにしています（最終更新：${esc(data.updated_at.slice(0, 10))}）。同じ作品で複数の役を演じている場合は1作品として数えています。放送開始後にキャストが追加される作品もあるため、数は変わることがあります。</p>`;
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
    const titles = ids.map(id => data.works[id].title).sort((a, b) => a.localeCompare(b, 'ja'));
    const partner = partnerLinks[provider];
    const cta = partner
      ? `<a class="cta" href="${esc(partner)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(provider)}" data-ga-page-type="vod_article" data-ga-position="${rank}">${esc(label(provider))}をチェック ↗</a>`
      : '';
    return `<tr><td class="rank">${rank}位</td><td><strong>${esc(label(provider))}</strong><span class="bar"><i style="width:${Math.round((ids.length / max) * 100)}%"></i></span>
<details><summary>配信作品を見る（${ids.length}作品）</summary><div class="works">${titles.map(esc).join('、')}</div></details>${cta}</td><td class="num">${ids.length}作品<br><span class="note">${Math.round((ids.length / withVod.length) * 100)}%</span></td></tr>`;
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
