# voice-search-app

## Data cleanup

`build_data_from_sources.py` excludes cast names that are not written in Japanese or Latin characters. It also uses `title_aliases.csv` to merge alternate titles into one work.

To add a title variant, add a row with the preferred display name in `canonical_title` and the alternate source spelling in `alias_title`. The aliases are applied when merging source data and when generating `data.json`; `coverage_report.py` uses the same mapping.

## VOD availability

The data build uses VOD providers extracted from Annict work pages. The separate candidate-review workflow below can record verified findings in `vod_overrides.csv`, but those overrides are not merged into the Annict-only `data.json`.

`build_data_from_sources.py` rebuilds `data.json` using Annict alone. It uses a valid `cache/annict.json` by default; pass `--refresh` to fetch fresh Annict API data and work pages, including supported streaming links and HTTPS `og:image` thumbnail URLs. The page renders available thumbnails in each work card; images remain hosted by Annict and are not copied into the repository. A failed refresh leaves the existing `data.json` intact. Set `ANNICT_TOKEN` in the process environment for `--refresh`; do not put it in source files or commit it.

Install dependencies with `python -m pip install -r requirements.txt` and `python -m playwright install chromium`. Run `python discover_vod_candidates.py` to look for ABEMA and U-NEXT title links on official work sites and configured lineup pages. Register official lineup pages in `vod_lineup_sources.csv` with the current `season` value from `data.json`; the crawler observes each page's `robots.txt` and request delay, and uses Chromium when a lineup is JavaScript-rendered. Review all rows in `vod_candidates.csv`, set `decision` to `approve` or `reject`, then run `python discover_vod_candidates.py --apply-approved` to add approved links to `vod_overrides.csv`. Fuzzy lineup matches are suggestions and must be checked before approval. Candidate URLs keep tracking parameters out.
voice-search-app
