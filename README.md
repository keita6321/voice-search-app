# voice-search-app

## Data cleanup

`build_data_from_sources.py` excludes cast names that are not written in Japanese or Latin characters. It also uses `title_aliases.csv` to merge alternate titles into one work.

To add a title variant, add a row with the preferred display name in `canonical_title` and the alternate source spelling in `alias_title`. The aliases are applied when merging source data and when generating `data.json`; `coverage_report.py` uses the same mapping.

## VOD availability

The data build uses VOD providers extracted from Annict work pages and curated entries in `vod_overrides.csv`. Thumbnails are extracted from the official sites listed in the Annict API response, not from Annict-hosted pages or images; official-site requests respect `robots.txt` and a crawl delay.

`build_data_from_sources.py` rebuilds `data.json` from Annict source data and curated entries in `vod_overrides.csv`. It uses a valid `cache/annict.json` by default; caches from versions that used Annict-hosted thumbnails are treated as stale and refreshed automatically. Pass `--refresh` to fetch fresh Annict API data and work pages, including supported streaming links and HTTPS `og:image` thumbnail URLs from each work's official site. The page renders available thumbnails in each work card; images are not copied into the repository. A failed refresh leaves the existing `data.json` intact. Set `ANNICT_TOKEN` in the process environment for `--refresh`; do not put it in source files or commit it.

Install dependencies with `python -m pip install -r requirements.txt` and `python -m playwright install chromium`. Run `python discover_vod_candidates.py` to look for ABEMA and U-NEXT title links on official work sites and configured lineup pages. Register official lineup pages in `vod_lineup_sources.csv` with the current `season` value from `data.json`; the crawler observes each page's `robots.txt` and request delay, and uses Chromium when a lineup is JavaScript-rendered. Review all rows in `vod_candidates.csv`, set `decision` to `approve` or `reject`, then run `python discover_vod_candidates.py --apply-approved` to add approved links to `vod_overrides.csv`. Fuzzy lineup matches are suggestions and must be checked before approval. Candidate URLs keep tracking parameters out.

## Static voice actor pages

After replacing `data.json` for a new anime season, use Node.js 18 or later and run `npm run build:pages`. Commit the generated `va/` pages and `sitemap.xml` together with the updated data. The generator keeps `robots.txt` pointed at the sitemap.

The shared 1200×630 OGP image is `assets/ogp-default.png` and is used by every voice actor page.

## X投稿の下書き生成

クール中は4週間ごとに`data.json`を更新した後、次の手順で下書きを作成します。

1. `npm run build:pages`
2. `npm run posts -- --start <開始日> --verify-pages --campaign <クール名>`（例：`2026autumn`）
3. `posts-out/posts-helper.html`を開き、投稿内容と個別ページの確認結果を確認します。
4. PCブラウザーのX公式予約画面に本文を貼り付けて予約し、補助ページで「予約済みにする」を押します。

主なオプションは次のとおりです。

| オプション | 説明 |
| --- | --- |
| `--days <n>` | 作成する日数（既定：28日） |
| `--per-day <1\|2>` | 1日の声優紹介数（既定：1件） |
| `--start <YYYY-MM-DD>` | 開始日（既定：明日） |
| `--mode <popular\|random>` | 声優の選び方（既定：出演本数順） |
| `--ranking-day <n>` | 週1投稿枠の起点日（1始まり）。7日ごとにランキング→データ小ネタ→ランキング6〜10番目→開発ログの順で切り替わります（既定：3、`0`で無効） |
| `--season-tag <tag>` | 季節ハッシュタグ（既定：`秋アニメ`） |
| `--campaign <name>` | UTMキャンペーン名（既定：`x_posts`。クールごとに変更） |
| `--link-style <utm\|ref>` | リンク計測形式（既定：UTM。`ref`では`?ref=x`形式） |
| `--no-history` | 紹介済み声優の記録を読み書きしない |
| `--inspect` | 実データの読み取り結果だけを表示して終了 |
| `--verify-pages` | 各声優ページの存在を確認し、欠落を警告してCSVと補助ページに表示 |

28日間では週1回の投稿枠が4週で一巡します。投稿URLのUTMは`utm_source=x&utm_medium=social&utm_campaign=<campaign>&utm_content=<声優ID/ranking/stats/devlog>`形式です。`utm_content`は声優紹介では声優ID、ランキングでは`ranking`、データ小ネタでは`stats`、開発ログでは`devlog`になります。クールが変わるたびに`--campaign`を変更してください。

X APIは利用しません。URL付き投稿のAPI利用費用を避け、無課金の運用として公式予約画面に手動で貼り付けます。補助ページの「予約済み」状態はブラウザーのローカルストレージに保存されます。投稿本文が変わった行は別の行として扱われ、予約済み状態がリセットされます。`posts-out/`は生成物のためGit管理対象外です。一方、紹介済み記録の`scripts/.post-history.json`はコミットして共有します。

## GA4 analytics

Set the GA4 measurement ID in the `GA_MEASUREMENT_ID` constant at the top of `assets/analytics.js`. Replace the `G-XXXXXXXXXX` placeholder with the ID from the GA4 web data stream before enabling production measurement. `PROD_HOSTNAMES` lists the hostnames allowed to send production events; add a production custom domain there if one is introduced.

Append `?ga_debug=1` to a page URL to enable GA4 DebugView events from localhost or a Vercel preview. Append `?ga_optout=1` to disable analytics in the current browser; `?ga_optout=0` removes that preference. Opt-out is stored in local storage.

Tracked events:

| Event | Parameters |
| --- | --- |
| `page_view` | `page_location`, `page_path`, `page_title` |
| `va_open` | `va_id`, `va_name`, `works_count` |
| `vod_click` | `vod_provider`, `work_id`, `work_title`, `va_id`, `va_name`, `link_host`, `position`, `page_type` |
| `official_site_click` | `work_id`, `work_title`, `va_id` |
| `share_x_click` | `va_id`, `va_name` |
| `copy_link_click` | `va_id` (if a copy-link button is added) |
| `vod_filter_change` | `filter_value` |
| `search` | `search_term`, `results_count` (sent after 800 ms without input) |
voice-search-app
