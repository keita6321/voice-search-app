import json
import tempfile
import unittest
from pathlib import Path

import build_data_from_sources as b


def data(season, roles):
    actors = {}
    for work_id, actor_id, name, character in roles:
        actors.setdefault(actor_id, {"actor_id": actor_id, "name": name, "reading": "", "roles": []})["roles"].append(
            {"work_id": work_id, "character_name": character})
    return {"season": season, "works": {}, "voice_actors": list(actors.values())}


class NewCastLogTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.prev = self.tmp / "data-next.json"
        self.log = self.tmp / "log.json"

    def test_first_run_only_sets_baseline(self):
        log = b.log_new_cast(self.prev, data("2027-winter", [("w1", "va0001", "A", "役1")]), self.log, today="2026-11-16")
        self.assertEqual(log, {"season": "2027-winter", "entries": []})

    def test_records_added_cast(self):
        self.prev.write_text(json.dumps(data("2027-winter", [("w1", "va0001", "A", "役1")])), encoding="utf-8")
        new = data("2027-winter", [("w1", "va0001", "A", "役1"), ("w1", "va0002", "B", "役2"), ("w2", "va0001", "A", "役3")])
        log = b.log_new_cast(self.prev, new, self.log, today="2026-11-16")
        self.assertEqual([(e["work_id"], e["actor_id"], e["date"]) for e in log["entries"]],
                         [("w1", "va0002", "2026-11-16"), ("w2", "va0001", "2026-11-16")])

    def test_resets_when_season_changes_and_drops_old_entries(self):
        self.log.write_text(json.dumps({"season": "2027-winter", "entries": [
            {"date": "2026-08-01", "work_id": "w0", "actor_id": "va0009", "name": "C", "character": "x"}]}), encoding="utf-8")
        self.prev.write_text(json.dumps(data("2027-winter", [])), encoding="utf-8")
        log = b.log_new_cast(self.prev, data("2027-winter", []), self.log, today="2026-11-16")
        self.assertEqual(log["entries"], [])  # 60日より前は消える
        self.prev.write_text(json.dumps(data("2027-winter", [("w1", "va0001", "A", "役1")])), encoding="utf-8")
        log = b.log_new_cast(self.prev, data("2027-spring", [("w9", "va0001", "A", "役1")]), self.log, today="2026-11-16")
        self.assertEqual(log, {"season": "2027-spring", "entries": []})


if __name__ == "__main__":
    unittest.main()
