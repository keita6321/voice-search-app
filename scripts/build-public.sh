#!/usr/bin/env bash
# Cloudflare Pages の公開用に、サイトで使うファイルだけを dist/ に集める。
# （リポジトリ直下の Python・CSV・台帳・キャッシュなどは公開しない）
# Cloudflare Pages の設定: ビルドコマンド「bash scripts/build-public.sh」、出力ディレクトリ「dist」
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
for f in index.html data.json data-next.json featured.json manifest.webmanifest robots.txt sitemap.xml google*.html _headers _redirects; do
  [ -e "$f" ] && cp "$f" dist/
done
# IndexNow（Bing など）の鍵ファイル。中身は鍵そのもので、公開して使うもの（秘密情報ではない）
for f in [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*.txt; do
  [ -e "$f" ] && cp "$f" dist/
done
for d in assets va work next ranking vod about privacy past tools costar sequel og; do
  [ -d "$d" ] && cp -R "$d" dist/
done
echo "dist/: $(find dist -type f | wc -l) files"
