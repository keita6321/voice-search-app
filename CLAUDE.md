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
  - 例外：作品のキービジュアル（`thumbnail`。公式サイトの画像）は、作品のイメージを伝えるためにトップの注目作品と /sequel/ で表示している（オーナー判断、2026-11-20）。読み込めないときは消えるようにしておく。

## よく使うコマンド

```bash
npm run build:pages                                  # data.json などから va/ work/ next/ ranking/ vod/ past/ などを生成
python3 -m unittest discover -s tests -t .           # テスト
python3 build_data_from_sources.py --refresh --season 2026-autumn             # 今期のデータを取り直す（ANNICT_TOKEN が必要）
python3 build_data_from_sources.py --refresh --preview --season 2027-winter   # 来期（data-next.json）
python3 discover_vod_candidates.py --auto            # 公式サイトから配信先を補う（vod_overrides.csv）
python3 past_works.py --max-minutes 60               # 声優の主な過去作（AniList。data/past-works.json）
npm run posts -- --start YYYY-MM-DD --days 7 --campaign 2027winter --season-tag 冬アニメ --verify-pages   # X の予約投稿の下書き
```

生成物（va/ work/ next/ ranking/ vod/ past/ sitemap.xml featured.json）はコミットする。
データやテンプレートを変えたら、必ず `npm run build:pages` を実行してからコミットする。

## 構成

- `index.html`：トップ兼 SPA。声優ページ（/va/0001/）のテンプレートでもある。
  - `PARTNER_SERVICES` が提携サービス、`PARTNER_OFFERS` が無料体験の文言。
- `scripts/generate-pages.mjs`：静的ページの生成。トップの「〇年〇アニメ」の表記も data.json のシーズンに合わせて書き換える。
- `scripts/articles.mjs`：作品ページ、ランキング、/vod/ 比較表（`VOD_PLANS`）、/next/。
- `scripts/x-tools.mjs`：X 運用ツール（/tools/x/、noindex・計測なし）。引用ポストの文面と、週のデータポストの文面・画像（canvas）を作る。
- `scripts/build-public.sh`：Cloudflare に出すファイルを dist/ にコピーする。新しいディレクトリやファイルを公開するときはここに追加する。
- データ
  - `data.json`：今期。
  - `data-next.json`：来期。
  - `data/registry/people.json`：声優 ID の台帳。URL を固定するためのもので、ID は変えない。
  - `data/work_notes.json`：手書きの作品紹介。
  - `data/past-works.json`：声優の主な過去作。作品ページのキャストに「主な出演」として1つ出す。
  - `data/prev-seasons.json`：続編の「前のシーズンから見るなら」。Prime Video の作品ページで、前のシーズンがプライム会員なら追加料金なしで見られると確かめたものだけ載せる（日付つき）。
  - `data/next-cast-log.json`：来期の新キャストの記録。
  - `data/news.json`：トップの「お知らせ」（先頭の1件だけ出る。新しい特集などを作ったら1行足す）。
  - `vod_overrides.csv`：配信先の手動修正。
  - `vod_providers.py`：サービスごとのリンク先。提携先はアフィリエイトリンク。
- `assets/analytics.js`：GA4 のイベント。
  - `vod_click` / `feature_click` / `special_click` / `share_native_click` / `costar_click` / `cast_click` / `ranking_click` / `list_open` / `x_follow_click` / `news_click` など。
  - 新しいイベントは `clickParams` に追加する。

## 自動更新（.github/workflows/data-refresh.yml）

- 毎週月曜 5:17 JST に動く。
- 今期・来期の取り直し → 配信先の補完 → 過去作 → テスト → ページ生成 → 安全チェックの順に進む。
- 安全チェックで作品数・声優数が 7 割未満に減っていたら止まる。通れば main に push する。
- レポートは `data/refresh-日時` ブランチに残る。
- 手動で動かすときは Actions タブの Run workflow で、`auto_apply` / `force_registry` / `past_minutes` を指定する。
- シーズンの切り替わりで止まったら、内容を確認してから `force_registry` と `auto_apply` を付けて再実行する。

## 提携の状況（2026-11-17 時点）

- **ABEMA**：A8 で提携中だが、サイトのボタンには使っていない（2026-11-17〜）。A8 は広告コードの文言変更や「リンク部分のみの使用」を禁止していて、ABEMA の案件には商品リンクがないため。/vod/ の比較表にだけ、発行されたコードを改変せずに貼っている（`scripts/articles.mjs` の `RAW_AD_CODES`。`rel` も発行されたまま）。
- **A8 全般**：テキスト原稿の文言を変えたり、URL だけ抜き出したりしない。自分の文言や作品ページへのリンクを使えるのは「商品リンク」がある案件だけ。
- **Amazon Prime Video**：afb で提携中（「自由テキスト」原稿＝自分の文言で使える原稿。リンク先は Prime Video のトップ、2026-11-17）。クリック時に `assets/analytics.js` が `&id1=<page_type>` を付け、afb の管理画面の「キーワード」で置き場所ごとの成果がわかる。無料体験があるので、作品数が同数なら ABEMA より優先する。
- **サイト URL の変更**：afb は承認済み（2026-11-17）。A8 / もしもは申請中。

## 環境についてのメモ

- サンドボックスやクラウドの環境からは Annict / AniList に届かないことがある。その場合はワークフローを手動で動かしてデータを取る。
- Claude なしでの運用手順は README の冒頭にある。
