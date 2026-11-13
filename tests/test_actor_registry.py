import copy
import unittest

import actor_registry as reg


def person(name, kana="", pids=(), status="active", season="2026-autumn"):
    return {"name": name, "kana": kana, "aliases": [], "annict_person_ids": list(pids),
            "first_seen": season, "last_seen": season, "status": status, "redirect_to": None}


def base_registry():
    return {"version": 1, "people": {
        "va0001": person("会沢紗弥", "あいざわさや"),
        "va0002": person("相原嵩明", "あいはらたかあき"),
        "va0003": person("愛美", "あいみ"),
    }}


def actor(name, reading="", pid=None):
    return {"name": name, "reading": reading, "annict_person_id": pid}


class AssignTest(unittest.TestCase):
    def test_existing_names_keep_ids_even_when_order_changes(self):
        registry = base_registry()
        ids, report = reg.assign(registry, [actor("愛美", "あいみ"), actor("会沢紗弥", "あいざわさや"),
                                            actor("相原嵩明", "あいはらたかあき")], "2027-winter")
        self.assertEqual(ids, {"愛美": "va0003", "会沢紗弥": "va0001", "相原嵩明": "va0002"})
        self.assertEqual(report["new"], [])
        self.assertEqual(registry["people"]["va0001"]["last_seen"], "2027-winter")
        self.assertEqual(registry["people"]["va0001"]["first_seen"], "2026-autumn")

    def test_new_actor_gets_next_number_and_absent_actor_becomes_inactive(self):
        registry = base_registry()
        ids, report = reg.assign(registry, [actor("会沢紗弥", "あいざわさや"), actor("相原嵩明", "あいはらたかあき"),
                                            actor("青木瑠璃子", "あおきるりこ")], "2027-winter")
        self.assertEqual(ids["青木瑠璃子"], "va0004")
        self.assertEqual(registry["people"]["va0003"]["status"], "inactive")
        self.assertEqual(report["inactivated"], [("va0003", "愛美")])

    def test_inactive_actor_comes_back_with_same_id(self):
        registry = base_registry()
        registry["people"]["va0003"]["status"] = "inactive"
        ids, report = reg.assign(registry, [actor("愛美", "あいみ"), actor("会沢紗弥"), actor("相原嵩明")], "2027-spring")
        self.assertEqual(ids["愛美"], "va0003")
        self.assertEqual(registry["people"]["va0003"]["status"], "active")
        self.assertEqual(report["reactivated"], [("va0003", "愛美")])

    def test_ids_are_never_reused(self):
        registry = base_registry()
        registry["people"]["va0009"] = person("過去の人", status="inactive")
        ids, _ = reg.assign(registry, [actor("新人", "しんじん"), actor("会沢紗弥"), actor("相原嵩明"), actor("愛美")], "2027-winter")
        self.assertEqual(ids["新人"], "va0010")

    def test_annict_id_match_handles_rename(self):
        registry = base_registry()
        registry["people"]["va0002"]["annict_person_ids"] = [111]
        ids, report = reg.assign(registry, [actor("相原たかあき", "あいはらたかあき", 111), actor("会沢紗弥"), actor("愛美")], "2027-winter")
        self.assertEqual(ids["相原たかあき"], "va0002")
        p = registry["people"]["va0002"]
        self.assertEqual(p["name"], "相原たかあき")
        self.assertIn("相原嵩明", p["aliases"])
        self.assertEqual(report["renamed"], [("va0002", "相原嵩明", "相原たかあき")])

    def test_annict_id_is_attached_on_name_match(self):
        registry = base_registry()
        reg.assign(registry, [actor("会沢紗弥", "あいざわさや", 42), actor("相原嵩明"), actor("愛美")], "2027-winter")
        self.assertEqual(registry["people"]["va0001"]["annict_person_ids"], [42])

    def test_reading_only_match_stops_for_review(self):
        registry = base_registry()
        before = copy.deepcopy(registry)
        with self.assertRaises(reg.RegistryError) as ctx:
            reg.assign(registry, [actor("會沢紗彌", "あいざわさや"), actor("相原嵩明"), actor("愛美")], "2027-winter")
        self.assertEqual(ctx.exception.review[0]["kind"], "reading_only")
        self.assertEqual(ctx.exception.review[0]["candidates"], ["va0001"])
        self.assertEqual(registry, before, "要確認のときは台帳を変更しない")

    def test_same_name_with_different_annict_id_stops_for_review(self):
        registry = base_registry()
        registry["people"]["va0003"]["annict_person_ids"] = [7]
        with self.assertRaises(reg.RegistryError) as ctx:
            reg.assign(registry, [actor("愛美", "あいみ", 8), actor("会沢紗弥"), actor("相原嵩明")], "2027-winter")
        self.assertEqual(ctx.exception.review[0]["kind"], "same_name_different_person")

    def test_overrides_resolve_review(self):
        registry = base_registry()
        over = {"match": {"name:會沢紗彌": "va0001"}}
        ids, report = reg.assign(registry, [actor("會沢紗彌", "あいざわさや"), actor("相原嵩明"), actor("愛美")], "2027-winter", over)
        self.assertEqual(ids["會沢紗彌"], "va0001")
        self.assertEqual(report["renamed"], [("va0001", "会沢紗弥", "會沢紗彌")])

        registry = base_registry()
        ids, _ = reg.assign(registry, [actor("會沢紗彌", "あいざわさや"), actor("会沢紗弥"), actor("相原嵩明"), actor("愛美")],
                            "2027-winter", {"new": ["name:會沢紗彌"]})
        self.assertEqual(ids["會沢紗彌"], "va0004")

    def test_merge_redirects_and_moves_aliases(self):
        registry = base_registry()
        registry["people"]["va0004"] = person("あいみ（旧表記）", "あいみ2", pids=[5], status="inactive")
        ids, _ = reg.assign(registry, [actor("愛美"), actor("会沢紗弥"), actor("相原嵩明")], "2027-winter",
                            {"merge": {"va0004": "va0003"}})
        self.assertEqual(registry["people"]["va0004"]["status"], "merged")
        self.assertEqual(registry["people"]["va0004"]["redirect_to"], "va0003")
        self.assertIn("あいみ（旧表記）", registry["people"]["va0003"]["aliases"])
        self.assertIn(5, registry["people"]["va0003"]["annict_person_ids"])

    def test_quality_gate_stops_on_sharp_drop(self):
        registry = base_registry()
        with self.assertRaises(reg.RegistryError):
            reg.assign(registry, [actor("愛美")], "2027-winter")
        ids, _ = reg.assign(registry, [actor("愛美")], "2027-winter", force=True)
        self.assertEqual(ids, {"愛美": "va0003"})

    def test_names_without_reading_do_not_trigger_reading_review(self):
        registry = base_registry()
        registry["people"]["va0004"] = person("Lynn", "")
        ids, _ = reg.assign(registry, [actor("LYNN2", "LYNN2"), actor("Lynn"), actor("会沢紗弥"), actor("相原嵩明"), actor("愛美")], "2027-winter")
        self.assertEqual(ids["LYNN2"], "va0005")


if __name__ == "__main__":
    unittest.main()
