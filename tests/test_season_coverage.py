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

    def test_grace_period_before_season_start(self):
        self.assertTrue(self.decide(node("9月末から続く", 2026, "SUMMER", [("2026-09-26T15:00:00Z", False)]))[0])

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
