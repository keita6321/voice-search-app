// 作品の「タイトルプレート」：他社のキービジュアルの代わりに、ジャンルごとの色・柄・書体・アイコンで作品の雰囲気を伝える。
// 画像は使わない（柄は CSS、アイコンは自前の線画 SVG）。ジャンルは data/work_style.json に作品ごとに書く。
import { readFileSync } from 'node:fs';

const PATTERNS = {
  dots: ['radial-gradient(rgba(255,255,255,.15) 1.5px,transparent 1.6px)', '14px 14px'],
  dotsSmall: ['radial-gradient(rgba(255,255,255,.16) 1.2px,transparent 1.3px)', '10px 10px'],
  stripes: ['repeating-linear-gradient(115deg,rgba(255,255,255,.12) 0 3px,transparent 3px 34px)', 'auto'],
  fine: ['repeating-linear-gradient(45deg,rgba(255,255,255,.07) 0 1px,transparent 1px 9px)', 'auto'],
  asanoha: ['repeating-linear-gradient(60deg,rgba(255,255,255,.08) 0 1px,transparent 1px 18px),repeating-linear-gradient(-60deg,rgba(255,255,255,.08) 0 1px,transparent 1px 18px),repeating-linear-gradient(0deg,rgba(255,255,255,.08) 0 1px,transparent 1px 15.6px)', 'auto'],
  grid: ['linear-gradient(rgba(255,255,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.09) 1px,transparent 1px)', '18px 18px'],
};

// 書体はスマホに入っている書体を優先し、トップの注目作品だけ Web フォント（作品名の文字だけ）を読み込む
export const FONTS = {
  mincho: "'Shippori Mincho','Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif",
  round: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN','Kosugi Maru',sans-serif",
  heavy: "'Dela Gothic One','Hiragino Sans','Noto Sans JP',sans-serif",
};

// 線画アイコン（24×24、白の線）
const ICONS = {
  sword: 'M14.5 3.5H20.5V9.5L11.5 18.5L8.5 15.5Z M5 16L8 19 M3 21L6.5 17.5',
  flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6.5 1 1 2 2 2 3.5 0-3 1-5 1-7z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  ball: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3.6 9.5c5.5 1.2 11.3 1.2 16.8 0 M3.6 14.5c5.5-1.2 11.3-1.2 16.8 0',
  search: 'M10 4a6 6 0 1 0 0 12a6 6 0 1 0 0-12z M14.5 14.5L20 20',
  fan: 'M3 15a9 9 0 0 1 18 0z M12 15V6 M12 15L6.2 8.2 M12 15l5.8-6.8 M12 15v5',
  rocket: 'M12 3c3 2.2 4 6 4 9l-2 4h-4l-2-4c0-3 1-6.8 4-9z M12 8.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z M10 16l-1.5 4 M14 16l1.5 4',
  mug: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 10.5h1.5a2 2 0 0 1 0 4H16 M8.5 3.5v2.5 M12 3.5v2.5',
  smile: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M8.5 14a4 4 0 0 0 7 0 M9 9.5v.5 M15 9.5v.5',
  note: 'M9 18V5.5l10-2V16 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0z M19 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0z',
  ghost: 'M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z M10 10v.5 M14 10v.5',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  tv: 'M4 7.5h16v11H4z M9 3.5l3 4 3-4',
};

// ジャンル：表示名・地の色・柄・書体・アイコン
export const GENRES = {
  fantasy: { short: '異世界', label: '異世界・ファンタジー', color: '#1f5a52', pattern: 'dots', font: 'heavy', icon: 'sword' },
  battle: { short: 'バトル', label: 'バトル・アクション', color: '#8b2c35', pattern: 'stripes', font: 'heavy', icon: 'flame' },
  romance: { short: '恋愛', label: '恋愛・ラブコメ', color: '#a3446d', pattern: 'dotsSmall', font: 'round', icon: 'heart' },
  youth: { short: '青春', label: '青春', color: '#2f6fa8', pattern: 'stripes', font: 'round', icon: 'ball' },
  sports: { short: 'スポーツ', label: 'スポーツ', color: '#b9561f', pattern: 'stripes', font: 'heavy', icon: 'ball' },
  mystery: { short: 'ミステリー', label: 'ミステリー・サスペンス', color: '#4a3d6b', pattern: 'fine', font: 'mincho', icon: 'search' },
  wa: { short: '和風・歴史', label: '和風・歴史', color: '#6e4b2a', pattern: 'asanoha', font: 'mincho', icon: 'fan' },
  sf: { short: 'SF', label: 'SF・ロボット', color: '#2b4566', pattern: 'grid', font: 'heavy', icon: 'rocket' },
  daily: { short: '日常', label: '日常・グルメ', color: '#5f6b2a', pattern: 'dots', font: 'round', icon: 'mug' },
  comedy: { short: 'コメディ', label: 'コメディ', color: '#8f6b0f', pattern: 'dotsSmall', font: 'round', icon: 'smile' },
  music: { short: '音楽', label: '音楽・アイドル', color: '#7e3a8c', pattern: 'stripes', font: 'round', icon: 'note' },
  horror: { short: 'ホラー', label: 'ホラー', color: '#2d2d33', pattern: 'fine', font: 'mincho', icon: 'ghost' },
  kids: { short: 'キッズ', label: 'キッズ・ショート', color: '#2f7a4c', pattern: 'dots', font: 'round', icon: 'star' },
  none: { short: '', label: '', color: '#1d2a44', pattern: 'fine', font: 'heavy', icon: 'tv' },
};

let cache = null;
export function loadWorkStyle(url = new URL('../data/work_style.json', import.meta.url)) {
  if (!cache) {
    try { cache = JSON.parse(readFileSync(url, 'utf8')).works ?? {}; } catch (error) { if (error.code !== 'ENOENT') throw error; cache = {}; }
  }
  return cache;
}

// 作品名から見た目を決める。指定がない作品は「none」（紺の標準カード、ジャンル名は出さない）
export function plateOf(title, works = loadWorkStyle()) {
  const entry = works[title] ?? {};
  const key = GENRES[entry.genre] ? entry.genre : 'none';
  const g = GENRES[key];
  const [image, size] = PATTERNS[g.pattern];
  return { key, label: entry.label || g.label, short: entry.label && entry.label.length <= 7 ? entry.label : g.short, tags: entry.tags ?? [], color: g.color, image, size, font: FONTS[g.font], fontKey: g.font, icon: ICONS[g.icon] };
}

// index.html（ブラウザ側）に渡す形。ジャンルごとの見た目と、作品名→ジャンルの対応
export function plateClientData(titles, works = loadWorkStyle()) {
  const genres = Object.fromEntries(Object.keys(GENRES).map(key => {
    const p = plateOf(`\u0000${key}`, { [`\u0000${key}`]: { genre: key } });
    return [key, { l: p.label, c: p.color, b: p.image, s: p.size, f: p.font, i: p.icon }];
  }));
  const map = {};
  for (const title of titles) {
    const entry = works[title];
    if (entry && GENRES[entry.genre]) map[title] = entry.label ? [entry.genre, entry.label] : entry.genre;
  }
  return { g: genres, w: map };
}

export const iconSvg = (path, cls = 'plate-ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
export const plateStyle = p => `background-color:${p.color};background-image:${p.image};background-size:${p.size}`;

// プレートに大きく出す作品名と、小さく出す「第3期」などに分ける。長いサブタイトル（～…～）は落とす
export function splitTitle(title) {
  let main = String(title).split(/\s*[～〜]/)[0].trim() || String(title);
  let sub = '';
  const m = /\s*(第[0-9０-９一二三四五六七八九十]+期(第[0-9０-９]+クール)?|第[0-9０-９]+クール|Season\s?[0-9]+|[0-9]+(st|nd|rd|th) season|Ⅱ|\([0-9]{4}\))$/i.exec(main);
  if (m && m.index > 0) { sub = m[1].replace(/^\(|\)$/g, ''); main = main.slice(0, m.index).trim(); }
  return { main, sub };
}

// トップの注目作品で使う Web フォント（Google Fonts）。作品名に出てくる文字だけを読み込むので軽い
export function plateFontHref(texts) {
  const chars = [...new Set([...texts.join('')])].join('');
  if (!chars) return '';
  return `https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@800&family=Shippori+Mincho:wght@700&display=swap&text=${encodeURIComponent(chars)}`;
}
