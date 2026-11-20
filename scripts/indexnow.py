"""IndexNow（Bing など）に、更新したページの URL を知らせる。

sitemap.xml の lastmod が指定日以降のページを送る（既定は今日・日本時間）。--all ですべて送る。
鍵はリポジトリ直下の <32桁の16進>.txt（中身も同じ文字列。サイトに公開して使うもので、秘密情報ではない）。
GitHub Actions から動かす（手元やサンドボックスからは外に出られないことがある）。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "animecastnow.com"
ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH = 10000


def find_key() -> str:
    keys = [p.stem for p in ROOT.glob("*.txt") if re.fullmatch(r"[0-9a-f]{32}", p.stem)]
    if len(keys) != 1:
        raise SystemExit(f"IndexNow の鍵ファイルが見つかりません（{len(keys)}個）")
    key = keys[0]
    if (ROOT / f"{key}.txt").read_text(encoding="utf-8").strip() != key:
        raise SystemExit("鍵ファイルの中身がファイル名と一致しません")
    return key


def urls_since(since: str | None) -> list[str]:
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    pairs = re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>", sitemap)
    return [loc for loc, lastmod in pairs if since is None or lastmod >= since]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="サイトマップのすべての URL を送る")
    parser.add_argument("--since", help="この日（YYYY-MM-DD）以降に更新したページを送る。既定は今日（日本時間）")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    today = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d")
    urls = urls_since(None if args.all else (args.since or today))
    if not urls:
        print("送る URL はありません")
        return 0
    key = find_key()
    print(f"IndexNow に送る URL：{len(urls)}件")
    if args.dry_run:
        print("\n".join(urls[:20]))
        return 0
    for start in range(0, len(urls), BATCH):
        body = json.dumps({
            "host": HOST,
            "key": key,
            "keyLocation": f"https://{HOST}/{key}.txt",
            "urlList": urls[start:start + BATCH],
        }).encode("utf-8")
        request = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                print(f"送信しました（HTTP {response.status}）")
        except urllib.error.HTTPError as error:
            # 200 / 202 以外：400 形式の誤り、403 鍵が確認できない、422 URL がホストと合わない、429 送りすぎ
            print(f"送信に失敗しました（HTTP {error.code}）：{error.read()[:300]!r}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
