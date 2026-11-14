import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextIndexPage, nextWorkPages, rankingPage, startLabel, vodPage, workPages, workIndexPage } from './articles.mjs';

if (Number(process.versions.node.split('.')[0]) < 18) {
  throw new Error('Node.js 18 or later is required.');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://anime-cast-now.vercel.app';
const sitemapUrl = `${origin}/sitemap.xml`;
const ogImage = `${origin}/assets/ogp-default.png`;
const seasonNames = {
  winter: '冬',
  spring: '春',
  summer: '夏',
  autumn: '秋',
  fall: '秋',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function escapeXml(value) {
  return escapeHtml(value);
}

function toPageId(actorId) {
  if (!actorId.startsWith('va') || !/^[a-zA-Z0-9_-]+$/.test(actorId.slice(2))) {
    throw new Error(`Invalid voice actor ID: ${actorId}`);
  }
  return actorId.slice(2);
}

function seasonLabel(season) {
  const match = /^(\d{4})-(winter|spring|summer|autumn|fall)$/.exec(season);
  if (!match) {
    throw new Error(`Invalid season: ${season}`);
  }
  return `${match[1]}年${seasonNames[match[2]]}アニメ`;
}

function characterLength(value) {
  return Array.from(value).length;
}

function makeDescription(actor, roles, works, label) {
  const prefix = `${actor.name}さんが${label}で出演する${roles.length}作品`;
  const suffix = 'と、配信中のVODをまとめて確認。';
  const listStart = `${prefix}（`;
  const titleNames = [...new Set(roles.map(role => works[role.work_id].title))];
  const available = Math.max(0, 110 - characterLength(`${listStart}）${suffix}`));
  let titleList = '';
  let truncated = false;

  for (const title of titleNames) {
    const separator = titleList ? '、' : '';
    const candidate = `${titleList}${separator}${title}`;
    if (characterLength(candidate) <= available) {
      titleList = candidate;
      continue;
    }

    truncated = true;
    let remaining = available - characterLength(titleList);
    if (separator && remaining > 1) {
      titleList += separator;
      remaining -= 1;
    }
    if (remaining > 0) {
      titleList += `${Array.from(title).slice(0, remaining - 1).join('')}…`;
    } else if (available > 0) {
      titleList = `${Array.from(titleList).slice(0, available - 1).join('')}…`;
    }
    break;
  }

  if (!truncated && titleNames.length > 0 && titleList !== titleNames.join('、')) {
    truncated = true;
  }
  if (truncated && titleList && !titleList.endsWith('…')) {
    titleList = `${Array.from(titleList).slice(0, Math.max(0, available - 1)).join('')}…`;
  }

  return `${listStart}${titleList}）${suffix}`;
}

function makeStaticContent(actor, roles, works, upcoming) {
  const roleItems = roles.map(role => {
    const work = works[role.work_id];
    return `<li>${escapeHtml(work.title)} — ${escapeHtml(role.character_name)}</li>`;
  }).join('\n');
  const nextItems = (upcoming?.roles ?? []).map(role => {
    const work = upcoming.works[role.work_id];
    const date = startLabel(work.start_date);
    return `<li><a href="/work/${escapeHtml(role.work_id)}/">${escapeHtml(work.title)}</a> — ${escapeHtml(role.character_name)}（${date ? `${escapeHtml(date)}放送開始` : '放送日未定'}）</li>`;
  }).join('\n');

  return `<main class="wrap seo-content" id="seo-content">
  <h1>${escapeHtml(actor.name)}</h1>
  <p>読み：${escapeHtml(actor.reading)}</p>
${roles.length ? `  <h2>今季の出演作品</h2>
  <ul>
${roleItems}
  </ul>
` : ''}${nextItems ? `  <h2>来期の出演予定（${escapeHtml(upcoming.label)}）</h2>
  <ul>
${nextItems}
  </ul>
` : ''}</main>
`;
}

function makeNextDescription(actor, upcoming) {
  const titles = [...new Set(upcoming.roles.map(role => upcoming.works[role.work_id].title))];
  let list = titles.join('、');
  if (characterLength(list) > 60) list = `${Array.from(list).slice(0, 59).join('')}…`;
  return `${actor.name}さんが${upcoming.label}で出演予定の${titles.length}作品（${list}）の放送日と役名をまとめて確認。`;
}

// upcoming: { label, works, roles } 来期の出演予定（なければ null）
function makePage(template, actor, roles, works, pageId, label, upcoming = null) {
  const pageUrl = `${origin}/va/${pageId}/`;
  const nextOnly = !roles.length;
  const title = nextOnly
    ? `${actor.name}さんの来期出演作（${upcoming.label}）｜ANIME CAST NOW`
    : `${actor.name}さんの今期出演作｜ANIME CAST NOW`;
  let description = nextOnly ? makeNextDescription(actor, upcoming) : makeDescription(actor, roles, works, label);
  if (!nextOnly && upcoming?.roles.length) description = description.replace(/。$/, `。来期の出演予定${new Set(upcoming.roles.map(r => r.work_id)).size}作品も掲載。`);
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'トップ', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: actor.name, item: pageUrl },
    ],
  }).replace(/[<>&]/g, character => ({
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
  })[character]);
  const metadata = [
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${pageUrl}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${pageUrl}">`,
    '<meta property="og:site_name" content="ANIME CAST NOW">',
    `<meta property="og:image" content="${ogImage}">`,
    '<meta property="og:locale" content="ja_JP">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
    `<script type="application/ld+json">${breadcrumb}</script>`,
  ].join('\n');
  const initialVa = `<script>window.__INITIAL_VA__ = ${JSON.stringify(actor.actor_id)};</script>\n`;
  const metadataMarker = /<!-- SOCIAL_METADATA_START -->[\s\S]*?<!-- SOCIAL_METADATA_END -->/;
  const headMarker = `</title>`;
  const bodyMarker = '<body>\n<div class="wrap">';
  const scriptMarker = '<script>\nconst $=';

  if (!template.includes(headMarker) || !metadataMarker.test(template) || !template.includes(bodyMarker) || !template.includes(scriptMarker)) {
    throw new Error('index.html is missing a required page-generation marker.');
  }

  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(metadataMarker, metadata)
    .replace(bodyMarker, `<body>\n${makeStaticContent(actor, roles, works, upcoming)}<div class="wrap">`)
    .replace(scriptMarker, `${initialVa}${scriptMarker}`);
}

// 台帳にいるが、今期の配信ありの出演作がない人のページ。URLを維持するため404にはしない。
// 中身が薄いので noindex にして、サイトマップには載せない。
function makeNoWorksPage(template, person, pageId, label, isCurrent, season) {
  const pageUrl = `${origin}/va/${pageId}/`;
  const title = `${person.name}さん｜ANIME CAST NOW`;
  const lastSeen = person.last_seen && person.last_seen !== season ? seasonLabelOrNull(person.last_seen) : null;
  const message = isCurrent
    ? `${label}の出演作は、配信先を確認中です。`
    : `${label}の出演作はありません。${lastSeen ? `（最後に出演を確認したのは${lastSeen}）` : ''}`;
  const description = `${person.name}さんの出演作をANIME CAST NOWで確認できます。${message}`;
  const metadata = [
    '<meta name="robots" content="noindex">',
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${pageUrl}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${pageUrl}">`,
    '<meta property="og:site_name" content="ANIME CAST NOW">',
    `<meta property="og:image" content="${ogImage}">`,
    '<meta property="og:locale" content="ja_JP">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
  ].join('\n');
  const content = `<main class="wrap seo-content" id="seo-content">
  <h1>${escapeHtml(person.name)}</h1>
  ${person.kana ? `<p>読み：${escapeHtml(person.kana)}</p>\n  ` : ''}<p>${escapeHtml(message)}</p>
  <p>ほかの声優は、下の一覧から検索できます。</p>
</main>
`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<!-- SOCIAL_METADATA_START -->[\s\S]*?<!-- SOCIAL_METADATA_END -->/, metadata)
    .replace('<body>\n<div class="wrap">', `<body>\n${content}<div class="wrap">`);
}

// 統合（merged）された旧IDのページ。統合先のページへ転送する。
function makeRedirectPage(person, targetPageId) {
  const target = `/va/${targetPageId}/`;
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>${escapeHtml(person.name)}さん｜ANIME CAST NOW</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${origin}${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace(${JSON.stringify(target)} + location.search);</script>
</head><body><p><a href="${target}">${escapeHtml(person.name)}さんのページへ移動します</a></p></body></html>
`;
}

function seasonLabelOrNull(season) {
  try {
    return seasonLabel(season);
  } catch {
    return null;
  }
}

async function readRegistry() {
  try {
    return JSON.parse(await readFile(path.join(root, 'data', 'registry', 'people.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function ensureRobotsSitemap() {
  const robotsPath = path.join(root, 'robots.txt');
  let robots = '';
  try {
    robots = await readFile(robotsPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!robots.split(/\r?\n/).some(line => line.trim() === `Sitemap: ${sitemapUrl}`)) {
    const separator = robots.trimEnd() ? '\n\n' : '';
    await writeFile(robotsPath, `${robots.trimEnd()}${separator}Sitemap: ${sitemapUrl}\n`);
  }
}

const data = JSON.parse(await readFile(path.join(root, 'data.json'), 'utf8'));
const template = (await readFile(path.join(root, 'index.html'), 'utf8')).replace(/\r\n/g, '\n');
const label = seasonLabel(data.season);
// 来期の先行取得（data-next.json）。なければ来期のページは作らない
let next = null;
try {
  next = JSON.parse(await readFile(path.join(root, 'data-next.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (next && next.season === data.season) next = null; // 今期と同じシーズンなら使わない（切り替え後の取り残し）
const nextLabel = next ? seasonLabel(next.season) : null;
// 今期と同じタイトルの作品（同じID）は、今期のページを優先する
const nextWorkIds = new Set(next ? Object.keys(next.works).filter(id => !data.works[id]) : []);
const upcomingById = new Map();
for (const actor of next?.voice_actors ?? []) {
  const roles = actor.roles.filter(role => nextWorkIds.has(role.work_id));
  if (roles.length) upcomingById.set(actor.actor_id, { actor, upcoming: { label: nextLabel, works: next.works, roles } });
}
const actors = [];
const seenIds = new Set();

for (const actor of data.voice_actors) {
  const pageId = toPageId(actor.actor_id);
  if (seenIds.has(pageId)) {
    throw new Error(`Duplicate voice actor page ID: ${pageId}`);
  }
  seenIds.add(pageId);
  const roles = actor.roles.filter(role => data.works[role.work_id]?.vod_links?.length);
  if (roles.length) actors.push({ actor, roles, pageId });
}

for (const { actor, roles, pageId } of actors) {
  const directory = path.join(root, 'va', pageId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), makePage(template, actor, roles, data.works, pageId, label, upcomingById.get(actor.actor_id)?.upcoming));
}
// 今期の配信ありの出演作はないが、来期の出演予定がある人のページ（検索対象にする）
const nextOnlyActors = [];
for (const [actorId, { actor, upcoming }] of upcomingById) {
  const pageId = toPageId(actorId);
  if (actors.some(item => item.pageId === pageId)) continue;
  const directory = path.join(root, 'va', pageId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), makePage(template, actor, [], data.works, pageId, label, upcoming));
  nextOnlyActors.push({ pageId });
}

// 台帳（data/registry/people.json）にいる全員のURLを維持する
const registry = await readRegistry();
let noWorksCount = 0;
let redirectCount = 0;
if (registry) {
  const currentIds = new Set(data.voice_actors.map(actor => actor.actor_id));
  for (const actor of data.voice_actors) {
    if (!registry.people[actor.actor_id]) {
      throw new Error(`data.json の ${actor.actor_id}（${actor.name}）が台帳にありません。build_data_from_sources.py で data.json を作り直してください`);
    }
  }
  for (const actorId of upcomingById.keys()) {
    if (!registry.people[actorId]) {
      throw new Error(`data-next.json の ${actorId} が台帳にありません。build_data_from_sources.py --preview で作り直してください`);
    }
  }
  const pageIds = new Set([...actors, ...nextOnlyActors].map(({ pageId }) => pageId));
  for (const [actorId, person] of Object.entries(registry.people)) {
    const pageId = toPageId(actorId);
    if (pageIds.has(pageId)) continue;
    const directory = path.join(root, 'va', pageId);
    await mkdir(directory, { recursive: true });
    if (person.status === 'merged' && person.redirect_to) {
      await writeFile(path.join(directory, 'index.html'), makeRedirectPage(person, toPageId(person.redirect_to)));
      redirectCount += 1;
    } else {
      await writeFile(path.join(directory, 'index.html'), makeNoWorksPage(template, person, pageId, label, currentIds.has(actorId), data.season));
      noWorksCount += 1;
    }
  }
}

// 記事ページ（データから毎クール作り直す）
// 提携済みサービスは index.html の PARTNER_SERVICES と同じものを使い、リンクは data.json から取る
const partnerMatch = template.match(/PARTNER_SERVICES=new Set\((\[[^\]]*\])\)/);
const partnerServices = partnerMatch ? JSON.parse(partnerMatch[1].replaceAll("'", '"')) : [];
const partnerLinks = {};
for (const work of Object.values(data.works)) {
  for (const link of work.vod_links ?? []) {
    if (partnerServices.includes(link.provider)) partnerLinks[link.provider] ??= link.url;
  }
}
const aboutHtml = await readFile(path.join(root, 'about', 'index.html'), 'utf8');
const articleContext = { data, seasonLabel: label, seasonLabelOf: seasonLabel, origin, ogImage, aboutHtml, partnerLinks, partnerServices };
for (const [dir, html] of [['ranking', rankingPage(articleContext)], ['vod', vodPage(articleContext)], ['work', workIndexPage(articleContext)], ['next', nextIndexPage(articleContext, next)]]) {
  await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, dir, 'index.html'), html);
}
// 作品ページ（/work/<作品ID>/）。今期のデータにない作品のディレクトリは消さずに残す
const works = [...workPages(articleContext), ...(next ? nextWorkPages(articleContext, next, new Set(Object.keys(data.works))) : [])];
for (const { id, html } of works) {
  await mkdir(path.join(root, 'work', id), { recursive: true });
  await writeFile(path.join(root, 'work', id, 'index.html'), html);
}
const indexedWorkUrls = works.filter(w => w.indexed).map(w => `${origin}/work/${w.id}/`);

const sitemapDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const sitemapUrls = [`${origin}/`, `${origin}/ranking/`, `${origin}/vod/`, `${origin}/work/`, ...(next ? [`${origin}/next/`] : []), ...indexedWorkUrls, `${origin}/about/`, `${origin}/privacy/`, ...[...actors, ...nextOnlyActors].map(({ pageId }) => `${origin}/va/${pageId}/`)];
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapUrls.flatMap(url => [
    '  <url>',
    `    <loc>${escapeXml(url)}</loc>`,
    `    <lastmod>${sitemapDate}</lastmod>`,
    '  </url>',
  ]),
  '</urlset>',
  '',
].join('\n');

await writeFile(path.join(root, 'sitemap.xml'), sitemap);
await ensureRobotsSitemap();
if (next) console.log(`Next season (${nextLabel}): ${nextWorkIds.size} works, ${upcomingById.size} actors (${nextOnlyActors.length} next-only pages).`);
console.log(`Generated ${actors.length} voice actor pages, ${works.length} work pages (${indexedWorkUrls.length} indexed) and sitemap.xml.`);
if (registry) {
  console.log(`Kept ${noWorksCount} pages without current works (noindex) and ${redirectCount} redirect pages from the ID registry.`);
}
