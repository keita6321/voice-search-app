# voice-search-app

## Data cleanup

`build_data_from_sources.py` excludes cast names that are not written in Japanese or Latin characters. It also uses `title_aliases.csv` to merge alternate titles into one work.

To add a title variant, add a row with the preferred display name in `canonical_title` and the alternate source spelling in `alias_title`. The aliases are applied when merging source data and when generating `data.json`; `coverage_report.py` uses the same mapping.

## VOD availability

The data build uses VOD providers extracted from Annict work pages and curated entries in `vod_overrides.csv`. Thumbnails are extracted from the official sites listed in the Annict API response, not from Annict-hosted pages or images; official-site requests respect `robots.txt` and a crawl delay.

`build_data_from_sources.py` rebuilds `data.json` from Annict source data and curated entries in `vod_overrides.csv`. It uses a valid `cache/annict.json` by default; caches from versions that used Annict-hosted thumbnails are treated as stale and refreshed automatically. Pass `--refresh` to fetch fresh Annict API data and work pages, including supported streaming links and HTTPS `og:image` thumbnail URLs from each work's official site. The page renders available thumbnails in each work card; images are not copied into the repository. A failed refresh leaves the existing `data.json` intact. Set `ANNICT_TOKEN` in the process environment for `--refresh`; do not put it in source files or commit it.

Install dependencies with `python -m pip install -r requirements.txt` and `python -m playwright install chromium`. Run `python discover_vod_candidates.py` to look for ABEMA and U-NEXT title links on official work sites and configured lineup pages. Register official lineup pages in `vod_lineup_sources.csv` with the current `season` value from `data.json`; the crawler observes each page's `robots.txt` and request delay, and uses Chromium when a lineup is JavaScript-rendered. Review all rows in `vod_candidates.csv`, set `decision` to `approve` or `reject`, then run `python discover_vod_candidates.py --apply-approved` to add approved links to `vod_overrides.csv`. Fuzzy lineup matches are suggestions and must be checked before approval. Candidate URLs keep tracking parameters out.

## 提携済みVODの管理

詳細画面の「〇〇で見る」ボタンは、アフィリエイト提携済みのサービスだけに表示します。提携していないサービスは、「ほかの配信」として文字だけで案内し、リンクは張りません。

新しくVODと提携できたら、次の2か所を更新します。

1. `vod_providers.py`の、そのサービスのURLを、ASPのアフィリエイトリンクに差し替える
2. `index.html`の`PARTNER_SERVICES`に、サービス名（`vod_providers.py`のキーと同じ表記）を追加する

その後、`python3 build_data_from_sources.py`で`data.json`を作り直し、`npm run build:pages`を実行してコミットします。

## 取得の対象（シーズン・継続作品・キャストの補完）

`build_data_from_sources.py`は、次のルールで今期の作品を集めます。

- **今期の作品**：Annictで今期（例：`2026-autumn`）に登録された作品
- **前クールから続く作品**：前クールに登録された作品のうち、本放送の最新の放送日が今期の開始から4週間以降のもの（2クール目の作品など。前クールの最終回が今期の頭にずれ込んだだけの作品は外す）。判定の結果は`reports/carryover-<season>.md`に出ます。放送日がAnnictに登録されていない配信のみの作品などは、`season_carryover.csv`（列：`season,title,include`）で手動で含める（`yes`）か外す（`no`）ことができます。
- **キャストの補完**：Annictにキャストが未登録の作品は、AniListのキャストで補います。作品の選定はAnnictが軸のままです。

シーズンは`--season`で指定できます（例：`python3 build_data_from_sources.py --refresh --season 2027-winter`）。キャッシュはシーズンごとに`cache/annict-<season>.json`、`cache/anilist-<season>.json`に保存されます。

## 作品紹介（手書き）

`data/work_notes.json`に書いた作品は、作品ページ（`/work/<id>/`）に「どんな作品？」の欄が出ます。キーは`data.json`の作品名と完全に一致させます。項目は`intro`（紹介文）、`points`（見どころ）、`before`（前作は見ておくべき？、続編のみ）、`broadcast`（放送枠）、`staff`（主なスタッフ）、`sources`（確認に使った資料のURL）です。放送前・放送中の作品なので、結末に触れるネタバレは書きません。

## 来期の先行取得（data-next.json）

来期の作品は、キャストが発表された時点で先に載せます。今期の`data.json`とは別に`data-next.json`を作ります。

```
python3 build_data_from_sources.py --refresh --preview --season 2027-winter
npm run build:pages
```

GitHub Actionsの「データ更新」は、**毎週月曜5:17（日本時間）に自動で実行**されます。今期（今日の日付から決まるシーズン）と来期（その次のシーズン）を取り直し、安全チェックを通れば`main`に反映して、そのまま本番に公開します。安全チェックでは、作品数か声優数が前回の7割未満に減っていたら、取得の失敗とみなして反映を止めます。声優IDの台帳の要確認や品質ゲートで止まった場合も、反映しません。レポートとログは、毎回`data/refresh-<日時>`ブランチに残ります（新しい10本だけ保存）。

毎週の更新では、データを取り直す前に、`discover_vod_candidates.py --auto`で各作品の公式サイト（トップと、配信・放送情報らしいページを最大2つ）を見て、配信サービスの作品ページへのリンクがあれば`vod_overrides.csv`に追加します。対象はABEMA、U-NEXT、Disney+、Prime Video（`/gp/video/`のページだけ。Blu-rayなどの商品ページは拾いません）、dアニメストア、DMM TV、Hulu、Netflixです。VODサイト自体やまとめサイトはクロールしません。`robots.txt`と間隔は守ります。追加した内容は`reports/vod-discovery-<season>.md`に出ます。間違いがあれば、`vod_overrides.csv`のその行を消してください。

手動で実行する場合は、`season`と`next_season`を空欄にすると、自動実行と同じシーズンになります（`next_season`を`none`にすると、来期は取得しません）。`auto_apply`をオンにすると、自動実行と同じように本番に反映します。

クールが切り替わった最初の実行（1月・4月・7月・10月の第1月曜）は、今期の声優が入れ替わります。来期だった作品が今期になるため、前回より声優数が大きく減ると、品質ゲートで止まることがあります。その場合は、レポートを確認してから、`force_registry`と`auto_apply`をオンにして手動で実行してください。

- **対象**：Annictで来期に登録された作品のうち、キャストがある作品（前クールからの継続作品と劇場版は含めません）
- **放送開始日**：Annictの最初の本放送の日付（`start_date`）。未登録なら「放送日未定」と表示します
- **声優ID**：今期と同じ台帳を使います。新しい人は`status: "upcoming"`で採番し、今期の出演状態（`active`/`inactive`）は変えません。`upcoming`の人は、そのシーズンが来るまで`inactive`になりません
- **補助ファイル**：`reports/`にシーズン名付きで出します（`reports/coverage_missing-2027-winter.csv`など）。今期の`readings_todo.csv`などは上書きしません

表示は次のとおりです。

- **声優の詳細**：「来期の出演予定」として、放送開始日の順に表示します。今期の出演がない人は、検索したときだけ一覧に出ます
- **声優ページ**：来期の出演予定だけの人も、検索エンジンに載せるページにします
- **作品ページ**：`/work/<id>/`に「放送日とキャスト」のページを作ります。キャストがあれば、配信先が未定でも検索エンジンに載せます
- **来期の一覧**：`/next/`に放送開始日の順で並べ、放送までの日数を表示します

クールが切り替わったら、来期のシーズンで通常の更新（`--preview`なし）を行い、`data-next.json`を削除するか、次の来期で作り直します。`data-next.json`のシーズンが`data.json`と同じ場合は使われません。

## 声優IDの台帳（URLの固定）

声優ページのURL（`/va/<id>/`）は、クールをまたいでも同じ人を指すよう、`data/registry/people.json`の台帳でIDを管理します。`build_data_from_sources.py`は、並び順で連番を振り直さず、台帳からIDを割り当てます。一度振ったIDは、再利用も削除もしません。

照合の順番は次のとおりです。

1. `data/registry/overrides.json`の`match`と`new`（人が決めた結果。最優先）
2. Annictの人物ID（`annict_person_ids`）
3. 名前（または`aliases`）
4. 読みだけが別名の人と一致した場合は、改名や表記ゆれの可能性があるため、要確認として止まります
5. どれにも一致しない人は、既存の最大番号の続きで新規採番します

今期に出演がない人は`status: "inactive"`になります。ページは削除せず、「今期の出演作はありません」と表示し、`noindex`を付けてサイトマップから外します。再び出演すると、同じIDのまま`active`に戻ります。

### クール更新時の手順

1. `python3 build_data_from_sources.py --refresh`
2. 要確認がある場合は、`data/registry/review.json`の内容を見て、`overrides.json`に結果を書き、もう一度実行します。
3. `reports/registry-<season>.md`で、新規採番、名前の変更、今期出演なしの人数を確認します。
4. `npm run build:pages`を実行し、`data.json`、`data/registry/`、`va/`、`sitemap.xml`をコミットします。

`overrides.json`の書き方は次のとおりです。キーは`annict:<Annictの人物ID>`または`name:<声優名>`です。

```json
{
  "match": { "name:會沢紗彌": "va0001" },
  "new": ["name:同名の別人"],
  "merge": { "va0600": "va0001" }
}
```

- `match`: 指定したIDの人と同一人物として扱います（改名、表記ゆれ）。
- `new`: 別人として新しいIDを振ります（同名の別人、読みが同じ別人）。
- `merge`: 同一人物に2つのIDが振られていた場合に、左のIDを右のIDに統合します。左のIDのページは、右のページへの転送ページになります。

今回の声優数が、前回の`active`の人数の半分未満になった場合は、取得の失敗を疑って止まります。問題がないことを確認した場合のみ、`--force-registry`を付けて実行してください。止まったときは、`data.json`と台帳のどちらも変更されません。

Annictの人物IDは、`--refresh`で取得したデータから記録されます。古いキャッシュには人物IDが入っていないため、その場合は名前で照合されます。

台帳を一から作り直す場合（通常は不要）は、`python3 actor_registry.py bootstrap`で、現在の`data.json`のIDをそのまま登録します。テストは`python3 -m unittest discover -s tests -t .`で実行できます。

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
| `--reply-link` | 本文にリンクを貼らず、返信（リプ欄）用のリンク文を別に出す。X公式の予約投稿では返信を予約できないため、返信は投稿後に手動で行う |

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
