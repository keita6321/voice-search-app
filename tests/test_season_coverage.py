import unittest
from datetime import date

import coverage_report as cr
import build_data_from_sources as bd


def node(title, season_year, season_name, programs):
    return {"title": title, "seasonYear": season_year, "seasonName": season_name,
            "programs": {"nodes": [{"startedAt": s, "rebroadcast": r} for s, r in programs]}}


class SeasonTest(unittest.TestCase):
    def test_previous_season_and_start(self):
        self.assertEqual(cr.previous_season("2026-autumn"), "2026-summer")
        self.assertEqual(cr.previous_season("2027-winter"), "2026-autumn")
        self.assertEqual(cr.season_start("2027-winter"), date(2027, 1, 1))
        with self.assertRaises(ValueError):
            cr.parse_season("2026-fall")

    def test_set_season_updates_anilist_season(self):
        cr.set_season("2027-winter")
        self.assertEqual((cr.SEASON, cr.YEAR, cr.AL_SEASON), ("2027-winter", 2027, "WINTER"))
        cr.set_season("2026-autumn")
        self.assertEqual(cr.AL_SEASON, "FALL")


class CarryoverTest(unittest.TestCase):
    season = "2026-autumn"

    def decide(self, n, include=(), exclude=()):
        return cr.carryover_decision(n, self.season, frozenset(include), frozenset(exclude))

    def test_current_season_work_is_kept(self):
        self.assertTrue(self.decide(node("今期の作品", 2026, "AUTUMN", []))[0])

    def test_previous_season_still_airing_is_kept(self):
        keep, reason, latest = self.decide(node("重騎士", 2026, "SUMMER", [("2026-11-12T15:00:00Z", False)]))
        self.assertTrue(keep)
        self.assertEqual(latest, "2026-11-12")

    def test_previous_season_ended_is_dropped(self):
        self.assertFalse(self.decide(node("夏で終了", 2026, "SUMMER", [("2026-09-20T15:00:00Z", False)]))[0])

    def test_rebroadcast_does_not_count(self):
        self.assertFalse(self.decide(node("再放送のみ", 2026, "SUMMER",
                                          [("2026-10-20T15:00:00Z", True), ("2026-09-20T15:00:00Z", False)]))[0])

    def test_finale_spilling_into_new_season_is_dropped(self):
        self.assertFalse(self.decide(node("最終回が10月上旬", 2026, "SUMMER", [("2026-10-07T15:00:00Z", False)]))[0])

    def test_four_weeks_into_season_counts_as_continuing(self):
        self.assertTrue(self.decide(node("10月末以降も放送", 2026, "SUMMER", [("2026-10-29T15:00:00Z", False)]))[0])

    def test_manual_include_and_exclude(self):
        no_programs = node("配信のみ", 2026, "SUMMER", [])
        self.assertFalse(self.decide(no_programs)[0])
        self.assertTrue(self.decide(no_programs, include=["配信のみ"])[0])
        self.assertFalse(self.decide(node("今期の作品", 2026, "AUTUMN", []), exclude=["今期の作品"])[0])


class CastFallbackTest(unittest.TestCase):
    def test_annict_cast_is_preferred(self):
        w = {"casts": {"annict": [["主人公", "声優 一郎", "セイユウイチロウ", 1]], "anilist": [["Hero", "別の人"]]}}
        self.assertEqual(bd.pick_cast(w, {}), [("主人公", "声優一郎")])

    def test_anilist_fills_when_annict_has_no_cast(self):
        w = {"casts": {"annict": [], "anilist": [["杉元佐一", "小林 親弘"]]}}
        self.assertEqual(bd.pick_cast(w, {}), [("杉元佐一", "小林親弘")])


if __name__ == "__main__":
    unittest.main()


class VodOverridesTest(unittest.TestCase):
    def test_unmatched_title_warns_instead_of_failing(self):
        import os, tempfile
        from data_normalization import apply_vod_overrides
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as f:
            f.write("title,provider,source_url,checked_at\n")
            f.write("今期にない作品,Hulu,https://example.com/a,2026-10-28\n")
            f.write("テスト作品,Hulu,https://example.com/b,2026-10-28\n")
            path = f.name
        try:
            works = [{"title": "テスト作品"}]
            unmatched = apply_vod_overrides(works, {"Hulu": "https://www.hulu.jp"}, path)
            self.assertEqual(works[0]["vods"], ["Hulu"])
            self.assertEqual([t for _, t in unmatched], ["今期にない作品"])
        finally:
            os.remove(path)


class AniListMatchTest(unittest.TestCase):
    def test_mal_ids_match_across_string_and_int(self):
        works = cr.merge({"annict": [{"title": "ゴールデンカムイ 暴走列車編", "mal": "59000", "tid": None, "cast": []}],
                          "anilist": [{"title": "ゴールデンカムイ 最終章", "mal": 59000, "tid": None, "cast": [["杉元佐一", "小林親弘"]]}]}, {})
        self.assertEqual(len(works), 1)
        self.assertEqual(works[0]["casts"]["anilist"], [["杉元佐一", "小林親弘"]])

    def test_anilist_cast_skips_romaji_only_names(self):
        media = {"characters": {"edges": [
            {"node": {"name": {"native": "杉元佐一", "full": "Saichi Sugimoto"}}, "voiceActors": [{"name": {"native": "小林親弘", "full": "Chikahiro Kobayashi"}}]},
            {"node": {"name": {"native": None, "full": "Someone"}}, "voiceActors": [{"name": {"native": None, "full": "Romaji Only"}}]}]}}
        self.assertEqual(cr.anilist_cast(media), [["杉元佐一", "小林親弘"]])

    def test_lookup_uses_mal_then_guarded_search(self):
        calls = []
        def fake_post(url, payload, headers=None):
            calls.append(payload["variables"])
            edge = {"node": {"name": {"native": "役", "full": "x"}}, "voiceActors": [{"name": {"native": "声優 太郎", "full": "x"}}]}
            if "id" in payload["variables"]:
                return {"Media": {"title": {"native": "作品A", "romaji": "a"}, "startDate": {"year": 2026}, "characters": {"edges": [edge]}}}
            q = payload["variables"]["q"]
            if q == "作品B 第2期":
                return {"Page": {"media": [{"title": {"native": "作品B 第2期", "romaji": "b"}, "startDate": {"year": 2026}, "characters": {"edges": [edge]}}]}}
            return {"Page": {"media": [{"title": {"native": "まったく別の作品", "romaji": "c"}, "startDate": {"year": 2026}, "characters": {"edges": [edge]}}]}}
        original_post, original_sleep = cr.post, cr.time.sleep
        cr.post, cr.time.sleep = fake_post, lambda s: None
        try:
            found = cr.lookup_anilist_cast([{"title": "作品A", "mal": 1}, {"title": "作品B 第2期", "mal": None}, {"title": "作品C", "mal": None}])
        finally:
            cr.post, cr.time.sleep = original_post, original_sleep
        self.assertEqual(found["作品A"]["how"], "mal")
        self.assertEqual(found["作品B 第2期"]["how"], "search")
        self.assertNotIn("作品C", found)


class RetryTest(unittest.TestCase):
    def test_connection_error_is_retried(self):
        import requests
        attempts = []
        class Ok:
            status_code = 200
            def raise_for_status(self): pass
        def send():
            attempts.append(1)
            if len(attempts) < 3:
                raise requests.ConnectionError("Remote end closed connection")
            return Ok()
        original_sleep = cr.time.sleep
        cr.time.sleep = lambda s: None
        try:
            self.assertIsInstance(cr._request_with_retry(send), Ok)
        finally:
            cr.time.sleep = original_sleep
        self.assertEqual(len(attempts), 3)


class AnilistDateTest(unittest.TestCase):
    def test_full_date(self):
        self.assertEqual(cr.anilist_date({"year": 2027, "month": 1, "day": 8}), "2027-01-08")

    def test_partial_date_is_none(self):
        self.assertIsNone(cr.anilist_date({"year": 2027, "month": 1, "day": None}))
        self.assertIsNone(cr.anilist_date(None))


class FirstBroadcastTest(unittest.TestCase):
    def test_skips_rebroadcast_and_takes_earliest(self):
        node = {"firstPrograms": {"nodes": [{"startedAt": "2027-01-05T15:00:00Z", "rebroadcast": True},
                                             {"startedAt": "2027-01-08T14:30:00Z", "rebroadcast": False},
                                             {"startedAt": "2027-01-09T14:30:00Z", "rebroadcast": False}]}}
        self.assertEqual(cr.first_broadcast(node), "2027-01-08")
        self.assertIsNone(cr.first_broadcast({"firstPrograms": {"nodes": []}}))
        self.assertIsNone(cr.first_broadcast({}))

    def test_uses_japan_date_for_late_night(self):
        node = {"firstPrograms": {"nodes": [{"startedAt": "2027-01-08T15:30:00Z", "rebroadcast": False}]}}
        self.assertEqual(cr.first_broadcast(node), "2027-01-09")
