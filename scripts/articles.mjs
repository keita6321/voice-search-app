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
h3{margin:20px 0 6px;font-size:16px}
.related{margin-top:40px;padding-top:16px;border-top:1px solid #e3dfd2}
.date{white-space:nowrap;font-weight:700}
.countdown{display:inline-block;margin-left:4px;padding:0 7px;border-radius:999px;background:#f5f2fa;color:#62517f;font-size:12px;font-weight:700;white-space:nowrap}
.countdown:empty{display:none}
`;

function page({ origin, ogImage, aboutHtml, path, title, description, body, noindex = false, extraScript = '' }) {
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
<style>${style}${EXTRA_STYLE}</style>
</head>
<body>
<main>
<p><a href="/">ANIME CAST NOW トップへ戻る</a></p>
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

  const rows = ranked.map(({ rank, item: { actor, count } }) => {
    const seen = new Set();
    const works = actor.roles
      .filter(role => !seen.has(role.work_id) && seen.add(role.work_id))
      .map(role => `<a href="/work/${esc(role.work_id)}/">${esc(workTitle(role.work_id))}</a>（${esc(role.character_name)}）`)
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
    const titles = ids.map(id => ({ id, title: data.works[id].title })).sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    const partner = partnerLinks[provider];
    const cta = partner
      ? `<a class="cta" href="${esc(partner)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(provider)}" data-ga-page-type="vod_article" data-ga-position="${rank}">${esc(label(provider))}をチェック ↗</a>`
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
  return byWork;
}

// 手書きの作品紹介（data/work_notes.json）
function notesSection(note, title) {
  if (!note) return '';
  const hosts = (note.sources ?? []).map(url => {
    try { return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(new URL(url).hostname)}</a>`; } catch { return ''; }
  }).filter(Boolean);
  return `<h2>「${esc(title)}」はどんな作品？</h2>
<p>${esc(note.intro)}</p>
${note.broadcast ? `<p class="note">${esc(note.broadcast)}</p>` : ''}
${note.points?.length ? `<h3>見どころ</h3>
<ul>
${note.points.map(point => `<li>${esc(point)}</li>`).join('\n')}
</ul>` : ''}
${note.before ? `<h3>前作は見ておくべき？</h3>
<p>${esc(note.before)}</p>` : ''}
${note.staff ? `<p class="note">${esc(note.staff)}</p>` : ''}
${hosts.length ? `<p class="note">参考：${hosts.join('、')}</p>` : ''}`;
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
      ? `「${esc(work.title)}」は、${esc(names.join('、'))}で配信されています（${esc(asOf)}時点）。`
      : `「${esc(work.title)}」の配信サービスは、まだ確認できていません（${esc(asOf)}時点）。配信が決まり次第、このページに追加します。`;
    const buttons = partners.map((v, index) =>
      `<a class="cta" href="${esc(v.url)}" target="_blank" rel="sponsored noopener" data-ga-event="vod_click" data-ga-provider="${esc(v.provider)}" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}" data-ga-page-type="work" data-ga-position="${index + 1}">${esc(label(v.provider))}で見る ↗</a>`).join(' ');
    const vodSection = vods.length
      ? `<h2>配信しているサービス</h2>
${buttons ? `<p>${buttons}</p>` : ''}
${others.length ? `<p>${partners.length ? 'ほかの配信' : '配信'}：${esc(others.map(v => label(v.provider)).join('、'))}</p>` : ''}
<p class="note">見放題・レンタルの区別や配信開始日は、各サービスでご確認ください。</p>`
      : '';
    const castRows = cast.map(({ actor, roles }) =>
      `<tr><td>${esc(roles.join('／'))}</td><td><a href="/va/${toPageId(actor.actor_id)}/">${esc(actor.name)}</a></td><td class="num">${new Set(actor.roles.map(r => r.work_id)).size}作品</td></tr>`).join('\n');
    const relatedList = related.map(([wid, actors]) =>
      `<li><a href="/work/${esc(wid)}/">${esc(data.works[wid].title)}</a><span class="note">（${esc([...actors].slice(0, 3).join('、'))}${actors.size > 3 ? ` ほか${actors.size - 3}名` : ''}）</span></li>`).join('\n');

    const body = `<h1>「${esc(work.title)}」の配信はどこ？</h1>
<p class="lead">${lead}</p>
${vodSection}
${notesSection(notes[work.title], work.title)}
<h2>キャスト</h2>
<p class="note">名前を押すと、その声優の今期の出演作と配信先をまとめて見られます。右端は今期の出演作品数です。</p>
<table>
<thead><tr><th>役名</th><th>声優</th><th>今期</th></tr></thead>
<tbody>
${castRows}
</tbody>
</table>
${related.length ? `<h2>この作品の声優が、今期ほかに出ている作品</h2>
<p>「${esc(work.title)}」のキャストが出演している、${esc(seasonLabel)}のほかの作品です。共演している声優が多い順に並べています。</p>
<ul>
${relatedList}
</ul>` : ''}
${work.official_url ? `<p><a href="${esc(work.official_url)}" target="_blank" rel="noopener" data-ga-event="official_site_click" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}">公式サイト ↗</a></p>` : ''}
<h2>このページについて</h2>
<p class="note">作品とキャストはアニメ作品データベース「Annict」のAPI、配信先はAnnictの作品情報・公式サイト・配信サービスの公式ラインナップなどをもとにしています（最終更新：${esc(asOf)}）。配信状況は変わることがあります。</p>`;
    const description = vods.length
      ? `「${work.title}」は${names.slice(0, 4).join('、')}${names.length > 4 ? 'など' : ''}で配信中。キャスト${cast.length}名と、同じ声優が出ている${seasonLabel}のほかの作品もまとめています。`
      : `「${work.title}」のキャスト${cast.length}名と、同じ声優が出ている${seasonLabel}のほかの作品をまとめています。配信サービスは確認中です。`;
    // 配信先が確認できていない作品は検索に出さない（中身の薄いページを増やさないため）
    const indexed = vods.length > 0;
    const html = page({ ...ctx, path: `/work/${id}/`, title: `「${work.title}」の配信はどこ？見られるサービスとキャスト`, description, body, noindex: !indexed });
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
    const castRows = cast.map(({ actor, roles }) => {
      const count = counts.get(actor.actor_id);
      return `<tr><td>${esc(roles.join('／'))}</td><td><a href="/va/${toPageId(actor.actor_id)}/">${esc(actor.name)}</a></td><td class="num">${count ? `${count}作品` : '—'}</td></tr>`;
    }).join('\n');
    const relatedList = related.map(([wid, actors]) =>
      `<li><a href="/work/${esc(wid)}/">${esc(next.works[wid].title)}</a><span class="note">（${esc([...actors].slice(0, 3).join('、'))}${actors.size > 3 ? ` ほか${actors.size - 3}名` : ''}）</span></li>`).join('\n');
    const body = `<h1>「${esc(work.title)}」（${esc(nextLabel)}）の放送日とキャスト</h1>
<p class="lead">${lead}</p>
<h2>配信</h2>
<p>配信サービスは発表待ちです。発表され次第、このページに追加します。</p>
<h2>キャスト</h2>
<p class="note">名前を押すと、その声優の今期の出演作と来期の出演予定をまとめて見られます。右端は今期（${esc(ctx.seasonLabel)}）の出演作品数です。</p>
<table>
<thead><tr><th>役名</th><th>声優</th><th>今期</th></tr></thead>
<tbody>
${castRows}
</tbody>
</table>
${related.length ? `<h2>この作品の声優が、来期ほかに出る作品</h2>
<p>「${esc(work.title)}」のキャストが出演する、${esc(nextLabel)}のほかの作品です。共演する声優が多い順に並べています。</p>
<ul>
${relatedList}
</ul>` : ''}
${work.official_url ? `<p><a href="${esc(work.official_url)}" target="_blank" rel="noopener" data-ga-event="official_site_click" data-ga-work-id="${esc(id)}" data-ga-work-title="${esc(work.title)}">公式サイト ↗</a></p>` : ''}
<p><a href="/next/">${esc(nextLabel)}の放送日一覧へ</a></p>
<h2>このページについて</h2>
<p class="note">作品・キャスト・放送日はアニメ作品データベース「Annict」のAPIなどをもとにしています（最終更新：${esc(asOf)}）。放送前の情報のため、変更されることがあります。</p>`;
    const description = `「${work.title}」（${nextLabel}）は${date ? `${date}放送開始` : '放送日未定'}。キャスト${cast.length}名と、同じ声優が来期に出るほかの作品をまとめています。`;
    // キャストが発表済みの作品だけ検索に出す（配信先はまだなくてよい）
    const indexed = cast.length > 0;
    const html = page({ ...ctx, path: `/work/${id}/`, title: `「${work.title}」（${nextLabel}）の放送日とキャスト`, description, body, noindex: !indexed, extraScript: COUNTDOWN_SCRIPT });
    return { id, html, indexed };
  });
}

export function nextIndexPage(ctx, next) {
  if (!next) {
    return page({ ...ctx, path: '/next/', title: '来期アニメの放送日とキャスト', noindex: true,
      description: '来期のアニメの放送日とキャストは、発表され次第このページにまとめます。',
      body: '<h1>来期アニメの放送日とキャスト</h1>\n<p class="lead">来期のアニメの情報は準備中です。キャストが発表され次第、このページにまとめます。</p>' });
  }
  const nextLabel = ctx.seasonLabelOf(next.season);
  const byWork = castOf(next);
  const works = Object.entries(next.works).sort(byStart);
  const dated = works.filter(([, w]) => startLabel(w.start_date)).length;
  const rows = works.map(([id, work]) => {
    const cast = byWork.get(id) ?? [];
    const date = startLabel(work.start_date);
    const names = cast.slice(0, 3).map(({ actor }) => actor.name);
    return `<tr><td class="date">${date ? esc(date) : '放送日未定'}${date ? `<br>${countdown(work.start_date)}` : ''}</td><td><a href="/work/${esc(id)}/">${esc(work.title)}</a><div class="works">${esc(names.join('、'))}${cast.length > 3 ? ` ほか${cast.length - 3}名` : ''}</div></td></tr>`;
  }).join('\n');
  const title = `${nextLabel} 放送日一覧とキャスト`;
  const first = works.find(([, w]) => startLabel(w.start_date));
  const body = `<h1>${esc(title)}</h1>
<p class="lead">${esc(nextLabel)}として放送予定の${works.length}作品を、放送開始日の順に並べました（放送日が確認できているのは${dated}作品）。作品名を押すと、キャストと、同じ声優が来期に出るほかの作品を確認できます。</p>
<p class="note">声優名で検索すると、その声優の来期の出演予定も見られます（<a href="/">トップで検索</a>）。放送前の情報のため、変更されることがあります（最終更新：${esc(next.updated_at.slice(0, 10))}）。</p>
<table>
<thead><tr><th>放送開始</th><th>作品・おもなキャスト</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
  const description = `${nextLabel}の${works.length}作品を放送開始日の順にまとめた一覧。${first ? `最初の放送は${startLabel(first[1].start_date)}の「${first[1].title}」。` : ''}キャストと、声優ごとの来期の出演予定も確認できます。`;
  return page({ ...ctx, path: '/next/', title, description, body, extraScript: COUNTDOWN_SCRIPT });
}
