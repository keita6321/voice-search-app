import unittest
from datetime import date

import past_works as pw


def edge(mid, title, chars=("キャラ",), fmt="TV", year=2020, season="SPRING", status="FINISHED", adult=False,
         role="MAIN", popularity=1000):
    return {"characterRole": role, "characters": [{"name": {"native": c}} for c in chars],
            "node": {"id": mid, "title": {"native": title}, "seasonYear": year, "season": season,
                     "format": fmt, "status": status, "isAdult": adult, "startDate": {"year": year},
                     "popularity": popularity}}


class PastWorksTest(unittest.TestCase):
    def test_pick_staff_requires_exact_native_name(self):
        cands = [{"id": 1, "name": {"native": "小野大輔郎"}}, {"id": 2, "name": {"native": "小野 大輔"}}]
        self.assertEqual(pw.pick_staff(cands, "小野大輔")["id"], 2)
        self.assertIsNone(pw.pick_staff([{"id": 3, "name": {"native": "別人"}}], "小野大輔"))

    def test_pick_staff_uses_alternative_names(self):
        cands = [{"id": 5, "name": {"native": "新名義", "alternative": ["旧名義"]}}]
        self.assertEqual(pw.pick_staff(cands, "旧名義")["id"], 5)

    def test_series_key_groups_sequels(self):
        self.assertEqual(pw.series_key("鬼滅の刃 遊郭編"), pw.series_key("鬼滅の刃"))
        self.assertEqual(pw.series_key("劇場版 呪術廻戦 0"), pw.series_key("呪術廻戦"))
        self.assertEqual(pw.series_key("進撃の巨人2"), pw.series_key("進撃の巨人"))
        self.assertNotEqual(pw.series_key("ONE PIECE"), pw.series_key("ONE OUTS"))

    def test_select_past_filters_and_dedupes(self):
        staff = {"characterMedia": {"edges": [
            edge(1, "鬼滅の刃", ["竈門炭治郎"]),
            edge(2, "鬼滅の刃 遊郭編"),
            edge(3, "今期の作品"),
            edge(4, "大人向け", adult=True),
            edge(5, "MV", fmt="MUSIC"),
            edge(6, "未放送", status="NOT_YET_RELEASED"),
            edge(7, "同じシーズン", year=2026, season="FALL"),
            edge(8, "ほかの作品", ["A", "B"], fmt="MOVIE"),
        ]}}
        got = pw.select_past(staff, {pw.norm_title("今期の作品")}, {(2026, "FALL")})
        self.assertEqual([w["anilist_id"] for w in got], [1, 8])
        self.assertEqual(got[0]["character"], "竈門炭治郎")
        self.assertEqual(got[1]["character"], "A、B")

    def test_select_past_limits_count(self):
        staff = {"characterMedia": {"edges": [edge(i, f"作品タイトル{chr(0x30A2 + i)}") for i in range(20)]}}
        self.assertEqual(len(pw.select_past(staff, set(), set(), top_n=8)), 8)

    def test_main_roles_beat_bigger_cameos(self):
        staff = {"characterMedia": {"edges": [
            edge(1, "超人気作", ["端役"], role="BACKGROUND", popularity=900000),
            edge(2, "人気作", ["脇役"], role="SUPPORTING", popularity=500000),
            edge(3, "代表作", ["主人公"], role="MAIN", popularity=200000),
        ]}}
        got = pw.select_past(staff, set(), set())
        self.assertEqual([w["anilist_id"] for w in got], [3, 2])

    def test_ignores_empty_characters(self):
        e = edge(1, "作品")
        e["characters"].append(None)
        e2 = edge(2, "別の作品")
        e2["node"] = None
        got = pw.select_past({"characterMedia": {"edges": [e, e2, None]}}, set(), set())
        self.assertEqual([w["anilist_id"] for w in got], [1])

    def test_char_name_avoids_hangul_and_spaces(self):
        self.assertEqual(pw.char_name({"name": {"native": "라헬", "full": "Rachel"}}), "Rachel")
        self.assertEqual(pw.char_name({"name": {"native": "小野寺小咲 "}}), "小野寺小咲")

    def test_due(self):
        today = date(2026, 11, 15)
        self.assertTrue(pw.due(None, today, 28))
        self.assertFalse(pw.due({"fetched": "2026-11-01"}, today, 28))
        self.assertTrue(pw.due({"fetched": "2026-10-18"}, today, 28))


if __name__ == "__main__":
    unittest.main()
