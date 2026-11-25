"""他社の画像（作品のキービジュアルなど）をサイトに載せていないことを確かめる。

2026-11-25、ASP の審査で「掲載許可が不明な画像」を指摘されたため、作品の見た目は
自前のタイトルプレート（scripts/plate.mjs）にした。うっかり戻らないようにするためのテスト。
"""
import glob
import json
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# A8 の広告コードに含まれる計測用の 1px 画像だけは、発行されたまま使う決まりなので除く
ALLOWED = ("https://www12.a8.net/",)


class NoExternalImagesTest(unittest.TestCase):
    def test_pages_have_no_external_img(self):
        found = []
        for path in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
            rel = os.path.relpath(path, ROOT)
            if rel.startswith(("node_modules", "dist", ".git")):
                continue
            with open(path, encoding="utf-8") as f:
                html = f.read()
            for src in re.findall(r'<img[^>]*\bsrc="(https?://[^"]+)"', html):
                if not src.startswith(ALLOWED):
                    found.append(f"{rel}: {src}")
        self.assertEqual(found, [], "他社の画像が載っています")

    def test_data_has_no_thumbnails(self):
        for name in ["data.json", "data-next.json", *glob.glob(os.path.join(ROOT, "data", "archive", "*.json"))]:
            path = name if os.path.isabs(name) else os.path.join(ROOT, name)
            if not os.path.exists(path):
                continue
            with open(path, encoding="utf-8") as f:
                works = json.load(f).get("works", {})
            with_image = [w["title"] for w in works.values() if w.get("thumbnail")]
            self.assertEqual(with_image, [], f"{os.path.basename(path)} に画像の URL が残っています")


if __name__ == "__main__":
    unittest.main()
