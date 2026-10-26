# voice-search-app

## Data cleanup

`build_data_from_sources.py` and `crawl.py` exclude cast names that are not written in Japanese or Latin characters. They also use `title_aliases.csv` to merge alternate titles into one work.

To add a title variant, add a row with the preferred display name in `canonical_title` and the alternate source spelling in `alias_title`. The aliases are applied when merging source data and when generating `data.json`; `coverage_report.py` uses the same mapping.
voice-search-app
