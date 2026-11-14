import csv
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import discover_vod_candidates as dv


class FakeFetcher:
    def __init__(self, pages):
        self.pages = pages
        self.requested = []

    def get(self, url):
        self.requested.append(url)
        return self.pages[url], url


TOP = """<a href="/onair/">放送・配信情報</a><a href="/news/">ニュース</a>
<a href="https://www.amazon.co.jp/dp/B0BLURAY">Blu-ray</a>"""
ONAIR = """<a href="https://animestore.docomo.ne.jp/animestore/ci_pc?workId=1">dアニメストア</a>
<a href="https://www.amazon.co.jp/gp/video/detail/B0VIDEO">Prime Video</a>
<a href="https://abema.tv/video/title/1-1">ABEMA</a>"""


class AutoDiscoverTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.overrides = self.tmp / "vod_overrides.csv"
        self.overrides.write_text("title,provider,source_url,checked_at\nテスト作品,ABEMA,https://abema.tv/video/title/1-1,2026-11-01\n", encoding="utf-8")
        patcher = mock.patch.object(dv, "OVERRIDES_PATH", self.overrides)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_info_pages_finds_onair_page(self):
        self.assertEqual(dv.info_pages(TOP, "https://example.com/"), ["https://example.com/onair/"])

    def test_adds_only_new_providers_from_official_site(self):
        data = {"season": "2026-autumn", "works": {"w1": {
            "title": "テスト作品", "official_url": "https://example.com/",
            "vod_links": [{"provider": "dアニメストア"}]}}}
        fetcher = FakeFetcher({"https://example.com/": TOP, "https://example.com/onair/": ONAIR})
        added, errors, verified, unverified = dv.auto_discover(data, fetcher, {}, today="2026-11-16", report_dir=self.tmp)
        self.assertEqual([(a["title"], a["provider"]) for a in added], [("テスト作品", "Amazon Prime Video")])
        self.assertEqual(errors, [])
        rows = list(csv.DictReader(self.overrides.open(encoding="utf-8")))
        self.assertEqual(rows[-1]["provider"], "Amazon Prime Video")
        self.assertEqual(rows[-1]["source_url"], "https://www.amazon.co.jp/gp/video/detail/B0VIDEO")
        self.assertTrue((self.tmp / "vod-discovery-2026-autumn.md").exists())

    def test_blu_ray_product_pages_are_not_prime_video(self):
        self.assertIsNone(dv.provider_for_url("https://www.amazon.co.jp/dp/B0BLURAY"))


class SourceVerificationTest(AutoDiscoverTest):
    def test_unofficial_source_is_replaced_when_official_site_links_it(self):
        self.overrides.write_text("title,provider,source_url,checked_at\nテスト作品,dアニメストア,https://animedia-khaki.vercel.app/x,2026-10-01\n"
                                  "テスト作品,Hulu,https://animedia-khaki.vercel.app/y,2026-10-01\n", encoding="utf-8")
        data = {"season": "2026-autumn", "works": {"w1": {
            "title": "テスト作品", "official_url": "https://example.com/", "vod_links": [{"provider": "dアニメストア"}]}}}
        fetcher = FakeFetcher({"https://example.com/": TOP, "https://example.com/onair/": ONAIR})
        added, errors, verified, unverified = dv.auto_discover(data, fetcher, {}, today="2026-11-16", report_dir=self.tmp)
        rows = {r["provider"]: r for r in csv.DictReader(self.overrides.open(encoding="utf-8"))}
        self.assertEqual(rows["dアニメストア"]["source_url"], "https://animestore.docomo.ne.jp/animestore/ci_pc?workId=1")
        self.assertEqual(rows["dアニメストア"]["checked_at"], "2026-11-16")
        self.assertEqual([v["provider"] for v in verified], ["dアニメストア"])
        self.assertEqual([(u["title"], u["provider"]) for u in unverified], [("テスト作品", "Hulu")])


if __name__ == "__main__":
    unittest.main()
