import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function makeStaticContent(actor, roles, works) {
  const roleItems = roles.map(role => {
    const work = works[role.work_id];
    return `<li>${escapeHtml(work.title)} — ${escapeHtml(role.character_name)}</li>`;
  }).join('\n');

  return `<main class="wrap seo-content" id="seo-content">
  <h1>${escapeHtml(actor.name)}</h1>
  <p>読み：${escapeHtml(actor.reading)}</p>
  <h2>今季の出演作品</h2>
  <ul>
${roleItems}
  </ul>
</main>
`;
}

function makePage(template, actor, roles, works, pageId, label) {
  const pageUrl = `${origin}/va/${pageId}/`;
  const title = `${actor.name}さんの今期出演作｜ANIME CAST NOW`;
  const description = makeDescription(actor, roles, works, label);
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
    .replace(bodyMarker, `<body>\n${makeStaticContent(actor, roles, works)}<div class="wrap">`)
    .replace(scriptMarker, `${initialVa}${scriptMarker}`);
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
  await writeFile(path.join(directory, 'index.html'), makePage(template, actor, roles, data.works, pageId, label));
}

const sitemapDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const sitemapUrls = [`${origin}/`, ...actors.map(({ pageId }) => `${origin}/va/${pageId}/`)];
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
console.log(`Generated ${actors.length} voice actor pages and sitemap.xml.`);
