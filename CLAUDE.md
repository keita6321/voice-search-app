# ANIME CAST NOW（voice-search-app）

今期アニメの声優を名前で検索し、出演作と配信先（VOD）を一覧できるサイト。本番は https://animecastnow.com 。
想定ユーザーはスマホからのアクセス。VOD のアフィリエイトで収益化している。運用は無料の範囲で行う。

## 作業の進め方

- コードの修正を頼まれたら、ブランチを切って PR を作り、main にマージして本番に反映するところまで進めてよい。
  - main に入ると Cloudflare（Workers Builds: animecastnow）が自動で本番に公開する。
  - マージ後は、そのコミットのチェック「Workers Builds: animecastnow」が success になるまで確認する。
- コミットの名義は `keita6321 <keita6321@users.noreply.github.com>`。
- 返事・コミットメッセージ・PR の説明・コード内のコメントは日本語で書く。

## 守ること

- **トークンや認証情報を自分で入力・貼り付けしない。**
  - `ANNICT_TOKEN` は GitHub のシークレットにあり、オーナーが入力したもの。コードや Git にも書かない。
- **ドメインや ASP などの支払い・契約・申請はオーナーが行う。** 必要なら手順を案内する。
- **サイトに事実と違うことを書かない。**
  - 例：計測していないのに「よく見られている」と書かない（今は「注目の声優」）。
  - 料金・無料期間は公式で確かめてから書き、確認した日付を添える。
- アフィリエイトリンクには `rel="sponsored noopener"` を付ける。広告を含むページには「当ページのリンクには広告が含まれています。」を出す。
- 他社のロゴや画像を勝手に使わない。
  - 作品のキービジュアル（公式サイトの画像）も使わない。2026-11-20 から表示していたが、もしもアフィリエイトの審査で「掲載許可が不明な画像」として登録を削除された（2026-11-25）。作品の見た目は自前のタイトルプレート（`scripts/plate.mjs`、ジャンルの色・柄・書体・線画アイコン。作品ごとのジャンルは `data/work_style.json`）で出す。`tests/test_no_external_images.py` が外部の画像を検出する。
  - 使えるのは、広告主や ASP がアフィリエイト用に配っている素材だけ（使う前に規約を確かめる）。

## よく使うコマンド

```bash
npm run build:pages                                  # data.json などから va/ work/ next/ ranking/ vod/ past/ などを生成
python3 -m unittest discover -s tests -t .           # テスト
python3 build_data_from_sources.py --refresh --season 2026-autumn             # 今期のデータを取り直す（ANNICT_TOKEN が必要）
python3 build_data_from_sources.py --refresh --preview --season 2027-winter   # 来期（data-next.json）
python3 discover_vod_candidates.py --auto            # 公式サイトから配信先を補う（vod_overrides.csv）
python3 past_works.py --max-minutes 60               # 声優の主な過去作（AniList。data/past-works.json）
python3 scripts/indexnow.py --dry-run                 # IndexNow（Bing など）に送る URL の確認（実際の送信は GitHub Actions から）
python3 scripts/og_images.py                         # 声優ごとの X 用画像（og/va/<ID>.jpg。日本語フォント Noto Sans CJK が必要）
npm run posts -- --start YYYY-MM-DD --days 7 --campaign 2027winter --season-tag 冬アニメ --verify-pages   # X の予約投稿の下書き
```

生成物（va/ work/ next/ ranking/ vod/ past/ og/ season/ sitemap.xml featured.json）とアーカイブ（data/archive/）はコミットする。
データやテンプレートを変えたら、必ず `npm run build:pages` を実行してからコミットする。

## 構成

- `index.html`：トップ兼 SPA。声優ページ（/va/0001/）のテンプレートでもある。
  - `PARTNER_SERVICES` が提携サービス、`PARTNER_OFFERS` が無料体験の文言。
- `scripts/generate-pages.mjs`：静的ページの生成。トップの「〇年〇アニメ」の表記も data.json のシーズンに合わせて書き換える。
- `scripts/articles.mjs`：作品ページ、ランキング、/vod/ 比較表（`VOD_PLANS`）、/next/、シーズンのまとめ（/season/<シーズン>/、放送中も終了後も同じ URL）。
- `scripts/x-tools.mjs`：X 運用ツール（/tools/x/、noindex・計測なし）。引用ポストの文面と、週のデータポストの文面・画像（canvas）を作る。
- `scripts/og_images.py`：声優ごとの X 用画像（名前・今期の出演作品数・出演作）。声優ページの og:image / twitter:image に使う。自動更新でも作り直す。
- `scripts/build-public.sh`：Cloudflare に出すファイルを dist/ にコピーする。新しいディレクトリやファイルを公開するときはここに追加する。
- データ
  - `data.json`：今期。
  - `data-next.json`：来期。
  - `data/registry/people.json`：声優 ID の台帳。URL を固定するためのもので、ID は変えない。
  - `data/work_notes.json`：手書きの作品紹介。（中身は Claude の下書き）
  - `data/owner_notes.json`：作品ページの「運営者のひとこと」。運営者（ゆすら）本人の回答をもとに、言い回しだけ整えたもの。内容を足さない・作らない。公開前に本人が確認する。ひとことがある作品は、トップの注目作品で先に並ぶ。
  - `data/past-works.json`：声優の主な過去作。作品ページのキャストに「主な出演」として1つ出す。
  - `data/prev-seasons.json`：続編の「前のシーズンから見るなら」。Prime Video の作品ページで、前のシーズンがプライム会員なら追加料金なしで見られると確かめたものだけ載せる（日付つき）。
  - `data/main-cast.json`：作品ページのキャストで先頭に出す主役級の役名（続編などで新しい役が先に登録されている作品用）。説明文の「役名：声優名」3人にも使う。
  - `data/archive/<シーズン>.json`：今期のデータの控え。ページ生成のたびに上書きし、シーズンが変わったあとは、終わったシーズンのまとめ（/season/<シーズン>/）と作品ページをここから作る（「今期」「配信中」を使わず、時点を明記した書き方になる）。
  - `data/next-cast-log.json`：来期の新キャストの記録。
  - `data/work_style.json`：作品ごとのジャンル（タイトルプレートの色・柄・書体を決める）と、トップの注目作品に出すタグ。指定がない作品は紺の標準カード。
  - `data/sitemap-state.json`：サイトマップの lastmod 用。ページごとの中身のハッシュと更新日（中身が変わったページだけ日付を進める）。
  - `data/news.json`：トップの「お知らせ」（先頭の1件だけ出る。新しい特集などを作ったら1行足す）。
  - `vod_overrides.csv`：配信先の手動修正。
  - `vod_providers.py`：サービスごとのリンク先。提携先はアフィリエイトリンク。
- `assets/analytics.js`：GA4 のイベント。
  - `vod_click` / `feature_click` / `special_click` / `share_native_click` / `costar_click` / `cast_click` / `ranking_click` / `list_open` / `x_follow_click` / `news_click` など。
  - 新しいイベントは `clickParams` に追加する。

## アクセスのまとめ（.github/workflows/analytics.yml）

- 毎朝 7:23 JST に GA4 と Search Console の数字を取って、`analytics` ブランチの `reports/latest.md`（まとめ）と `reports/YYYY-MM-DD.json`（数字そのもの）に残す。main には入れない。
- 読むとき：`gh api repos/keita6321/voice-search-app/contents/reports/latest.md?ref=analytics --jq .content | base64 -d`
- 認証はシークレット `GA_SA_KEY`（Google Cloud のプロジェクト animecastnow のサービスアカウント ga-reader の JSON。GA4 は閲覧者、Search Console は制限付き）。オーナーが登録した。
- 自分たちのアクセスは除外済み（オーナーのスマホ・PC、内蔵ブラウザで `?ga_optout=1`、2026-11-21〜22）。
- サイトを変えたら `docs/experiments.md`（実験の記録）に1行足す（何を・どの数字で・いつ判断するか）。判断日が来たら、オーナーに頼まれた振り返りのときに確かめる（週1の自動の振り返りは作っていない）。

## IndexNow（.github/workflows/indexnow.yml）

- Bing Webmaster Tools に登録済み（2026-11-20、Search Console から取り込み）。
- 鍵はリポジトリ直下の `<32桁の16進>.txt`（サイトに公開して使うもので、秘密情報ではない）。
- main の sitemap.xml が変わると、その日に更新したページ（lastmod が今日）を送る。データ更新のワークフローも最後に送る。
- 全ページを送り直すときは Actions タブで「IndexNow 送信」を all=true で動かす。

## 自動更新（.github/workflows/data-refresh.yml）

- 毎週月曜 5:17 JST に動く。
- 今期・来期の取り直し → 配信先の補完 → 過去作 → テスト → 声優ごとの X 用画像 → ページ生成 → 安全チェック → main に push → IndexNow の順に進む。
- 安全チェックで作品数・声優数が 7 割未満に減っていたら止まる。通れば main に push する。
- レポートは `data/refresh-日時` ブランチに残る。
- 手動で動かすときは Actions タブの Run workflow で、`auto_apply` / `force_registry` / `past_minutes` を指定する。
- シーズンの切り替わりで止まったら、内容を確認してから `force_registry` と `auto_apply` を付けて再実行する。

## 提携の状況（2026-11-20 時点）

- **ABEMA**：A8 で提携中だが、サイトのボタンには使っていない（2026-11-17〜）。A8 は広告コードの文言変更や「リンク部分のみの使用」を禁止していて、ABEMA の案件には商品リンクがないため。/vod/ の比較表と、声優ページの「まとめて見られる配信サービス」の枠（ABEMA で見られる作品があるとき、文字リンクで小さく）に、発行されたコードを改変せずに貼っている（`scripts/articles.mjs` の `RAW_AD_CODES` と `index.html` の `ABEMA_AD_CODE`。`rel` も発行されたまま。ボタン風の見た目にはしない）。2026-11-20 から様子見中：GA4 の vod_click（page_type: va_detail_abema）と、Prime のクリックが減っていないかを見て、続けるか決める。
- **A8 全般**：テキスト原稿の文言を変えたり、URL だけ抜き出したりしない。自分の文言や作品ページへのリンクを使えるのは「商品リンク」がある案件だけ。
  - A8 サポートの回答（2026-11-20）：広告素材は改変せずに使うのが前提。独自ボタンなどオリジナルの広告素材は不可。テキストの文言変更は「自由テキスト」と書かれた原稿のみ可。属性（rel など）の追加は自己責任で可（動作の保証なし）。→ ABEMA をボタンに戻すことはできない。
- **Amazon Prime Video**：afb で提携中（「自由テキスト」原稿＝自分の文言で使える原稿。リンク先は Prime Video のトップ、2026-11-17）。クリック時に `assets/analytics.js` が `&id1=<page_type>` を付け、afb の管理画面の「キーワード」で置き場所ごとの成果がわかる。無料体験があるので、作品数が同数なら ABEMA より優先する。
- **サイト URL の変更**：afb は承認済み（2026-11-17）。A8 / もしもは申請中。

## 環境についてのメモ

- サンドボックスやクラウドの環境からは Annict / AniList に届かないことがある。その場合はワークフローを手動で動かしてデータを取る。
- Claude なしでの運用手順は README の冒頭にある。
