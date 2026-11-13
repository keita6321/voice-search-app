#!/usr/bin/env python3
"""声優IDの台帳（data/registry/people.json）。

声優ページのURL（/va/<id>/）をクールをまたいで固定するため、一度振ったIDは
再利用も削除もしない。build_data_from_sources.py から assign() を呼んで使う。

照合の順番（1名ずつ）:
  1. data/registry/overrides.json の "match" / "new"（人が決めた結果。最優先）
  2. Annict の人物ID（annict_person_ids）が一致
  3. 名前（または aliases）が一致
  4. 読みだけが別名の1名と一致 → 改名・表記ゆれの可能性があるため「要確認」で停止
  5. どれにも一致しない → 新規ID（既存の最大番号の続き）

初回だけ:  python3 actor_registry.py bootstrap   （現在の data.json のIDをそのまま登録）
"""
import json, os, re, sys, tempfile, unicodedata

REGISTRY_DIR = os.path.join("data", "registry")
PEOPLE_PATH = os.path.join(REGISTRY_DIR, "people.json")
OVERRIDES_PATH = os.path.join(REGISTRY_DIR, "overrides.json")
REVIEW_PATH = os.path.join(REGISTRY_DIR, "review.json")
MIN_ACTIVE_RATIO = 0.5


class RegistryError(Exception):
    """要確認が残っている、または品質ゲートに引っかかった。"""
    def __init__(self, message, review=None):
        super().__init__(message)
        self.review = review or []


def _norm_name(name):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", name or ""))


def _norm_reading(reading, name=""):
    r = re.sub(r"\s+", "", unicodedata.normalize("NFKC", reading or ""))
    # 読みが取れず名前がそのまま入っているものは、読みとして扱わない
    return "" if not r or r == _norm_name(name) else r


def _id_number(actor_id):
    m = re.fullmatch(r"va(\d+)", actor_id)
    if not m:
        raise ValueError(f"台帳のIDの形式が不正です: {actor_id}")
    return int(m.group(1))


def format_id(number):
    return f"va{number:04d}"


def empty_registry():
    return {"version": 1, "people": {}}


def empty_overrides():
    return {"match": {}, "new": [], "merge": {}}


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, value):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=".tmp.", suffix=".json", dir=os.path.dirname(path) or ".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=2, sort_keys=False)
            f.write("\n")
        os.replace(temp_path, path)
    except Exception:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise


def _resolve(people, actor_id):
    """merged を転送先までたどる。"""
    seen = set()
    while people.get(actor_id, {}).get("status") == "merged" and people[actor_id].get("redirect_to"):
        if actor_id in seen:
            raise RegistryError(f"merged の転送がループしています: {actor_id}")
        seen.add(actor_id)
        actor_id = people[actor_id]["redirect_to"]
    if actor_id not in people:
        raise RegistryError(f"台帳に存在しないIDが指定されています: {actor_id}")
    return actor_id


def _apply_merges(people, merges):
    for src, dst in (merges or {}).items():
        if src not in people or dst not in people:
            raise RegistryError(f"overrides.json の merge に台帳にないIDがあります: {src} → {dst}")
        if src == dst:
            raise RegistryError(f"overrides.json の merge で同じIDが指定されています: {src}")
        s, d = people[src], people[dst]
        for alias in [s["name"], *s.get("aliases", [])]:
            if alias != d["name"] and alias not in d.setdefault("aliases", []):
                d["aliases"].append(alias)
        for pid in s.get("annict_person_ids", []):
            if pid not in d.setdefault("annict_person_ids", []):
                d["annict_person_ids"].append(pid)
        s["annict_person_ids"] = []
        s["status"], s["redirect_to"] = "merged", dst


def assign(registry, actors, season, overrides=None, force=False):
    """今期の声優に台帳のIDを割り当て、台帳を更新する。

    actors: [{"name": str, "reading": str, "annict_person_id": int|None}, ...]
    戻り値: (name → actor_id の辞書, レポート)
    要確認や品質ゲートの違反があれば RegistryError（台帳は変更しない）。
    """
    overrides = {**empty_overrides(), **(overrides or {})}
    people = json.loads(json.dumps(registry.get("people", {})))  # 失敗時に元の台帳を汚さないためのコピー
    _apply_merges(people, overrides.get("merge"))

    by_pid, by_name, by_reading = {}, {}, {}
    for actor_id, p in people.items():
        if p.get("status") == "merged":
            continue
        for pid in p.get("annict_person_ids", []):
            by_pid[pid] = actor_id
        for n in [p["name"], *p.get("aliases", [])]:
            by_name.setdefault(_norm_name(n), set()).add(actor_id)
        r = _norm_reading(p.get("kana"), p["name"])
        if r:
            by_reading.setdefault(r, set()).add(actor_id)

    match_over = overrides.get("match") or {}
    force_new = set(overrides.get("new") or [])
    next_number = max((_id_number(i) for i in people), default=0) + 1
    assigned, used_by, review = {}, {}, []
    report = {"new": [], "renamed": [], "matched": 0, "reactivated": [], "inactivated": []}
    pending_new = []
    incoming_names = {_norm_name(a["name"]) for a in actors}

    for a in actors:
        name, pid = a["name"], a.get("annict_person_id")
        reading = _norm_reading(a.get("reading"), name)
        keys = [f"annict:{pid}"] if pid is not None else []
        keys.append(f"name:{name}")
        actor_id = None

        over = next((match_over[k] for k in keys if k in match_over), None)
        if over:
            actor_id = _resolve(people, over)
        elif any(k in force_new for k in keys):
            pending_new.append(a); continue
        elif pid is not None and pid in by_pid:
            actor_id = by_pid[pid]
        else:
            same_name = by_name.get(_norm_name(name), set())
            if len(same_name) > 1:
                review.append({"kind": "same_name_multiple", "name": name, "annict_person_id": pid,
                               "candidates": sorted(same_name),
                               "hint": "同じ名前の人物が台帳に複数います。overrides.json の match で、どのIDか指定してください"})
                continue
            if same_name:
                candidate = next(iter(same_name))
                known = people[candidate].get("annict_person_ids", [])
                if pid is not None and known and pid not in known:
                    review.append({"kind": "same_name_different_person", "name": name, "annict_person_id": pid,
                                   "candidates": [candidate],
                                   "hint": f"{candidate} と同名ですが、Annictの人物IDが違います（同名の別人の可能性）。同一人物なら match、別人なら new に追加してください"})
                    continue
                actor_id = candidate
            else:
                # 今期も同じ名前で出ている人は、その名前で照合されるので候補から外す
                same_reading = [i for i in by_reading.get(reading, set())
                                if _norm_name(people[i]["name"]) not in incoming_names] if reading else []
                if len(same_reading) >= 1:
                    review.append({"kind": "reading_only", "name": name, "reading": reading, "annict_person_id": pid,
                                   "candidates": sorted(same_reading),
                                   "candidate_names": [people[i]["name"] for i in sorted(same_reading)],
                                   "hint": "読みだけが一致しています（改名・表記ゆれの可能性）。同一人物なら match、別人なら new に追加してください"})
                    continue
                pending_new.append(a); continue

        if actor_id in used_by and used_by[actor_id] != name:
            review.append({"kind": "duplicate_assignment", "name": name, "annict_person_id": pid,
                           "candidates": [actor_id], "conflicts_with": used_by[actor_id],
                           "hint": "2名が同じIDに割り当てられました。overrides.json で振り分けてください"})
            continue
        used_by[actor_id] = name
        assigned[name] = actor_id
        p = people[actor_id]
        if _norm_name(p["name"]) != _norm_name(name):
            report["renamed"].append((actor_id, p["name"], name))
            if p["name"] not in p.setdefault("aliases", []):
                p["aliases"].append(p["name"])
            p["aliases"] = [x for x in p["aliases"] if _norm_name(x) != _norm_name(name)]
            p["name"] = name
        if reading:
            p["kana"] = reading
        if pid is not None and pid not in p.setdefault("annict_person_ids", []):
            p["annict_person_ids"].append(pid)
        if p.get("status") != "active":
            report["reactivated"].append((actor_id, name))
        p["status"], p["last_seen"], p["redirect_to"] = "active", season, None
        report["matched"] += 1

    if review:
        raise RegistryError(f"要確認が {len(review)} 件あります（{REVIEW_PATH} を確認してください）", review)

    for a in sorted(pending_new, key=lambda x: (_norm_reading(x.get("reading"), x["name"]) or x["name"], x["name"])):
        actor_id = format_id(next_number); next_number += 1
        reading = _norm_reading(a.get("reading"), a["name"])
        pid = a.get("annict_person_id")
        people[actor_id] = {"name": a["name"], "kana": reading, "aliases": [],
                            "annict_person_ids": [pid] if pid is not None else [],
                            "first_seen": season, "last_seen": season, "status": "active", "redirect_to": None}
        assigned[a["name"]] = actor_id
        report["new"].append((actor_id, a["name"]))

    seen_ids = set(assigned.values())
    previous_active = sum(1 for p in registry.get("people", {}).values() if p.get("status") == "active")
    for actor_id, p in people.items():
        if p.get("status") == "active" and actor_id not in seen_ids:
            p["status"] = "inactive"
            report["inactivated"].append((actor_id, p["name"]))

    if previous_active and len(actors) < previous_active * MIN_ACTIVE_RATIO and not force:
        raise RegistryError(
            f"今回の声優数 {len(actors)} 名が、前回の active {previous_active} 名の {int(MIN_ACTIVE_RATIO * 100)}% 未満です。"
            "取得の失敗やデータ欠損の可能性があります。問題ないことを確認した場合のみ --force-registry で続行してください")

    registry["people"] = dict(sorted(people.items(), key=lambda kv: _id_number(kv[0])))
    registry.setdefault("version", 1)
    return assigned, report


def format_report(report, season):
    lines = [f"# 声優ID台帳の更新レポート（{season}）", "",
             f"- 既存IDに一致: {report['matched']}名",
             f"- 新規採番: {len(report['new'])}名",
             f"- 名前の変更: {len(report['renamed'])}名",
             f"- 再登場（inactive→active）: {len(report['reactivated'])}名",
             f"- 今期の出演なし（active→inactive）: {len(report['inactivated'])}名", ""]
    for title, key, fmt in [("新規採番", "new", lambda x: f"{x[0]} {x[1]}"),
                            ("名前の変更", "renamed", lambda x: f"{x[0]} {x[1]} → {x[2]}"),
                            ("再登場", "reactivated", lambda x: f"{x[0]} {x[1]}"),
                            ("今期の出演なし", "inactivated", lambda x: f"{x[0]} {x[1]}")]:
        if report[key]:
            lines += [f"## {title}", "", *[f"- {fmt(x)}" for x in report[key]], ""]
    return "\n".join(lines)


def bootstrap(data_path="data.json", people_path=PEOPLE_PATH):
    """現在の data.json のIDを、そのまま台帳に登録する（初回のみ）。"""
    if os.path.exists(people_path):
        raise SystemExit(f"{people_path} は既に存在します。上書きしません")
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)
    people, names = {}, set()
    for a in data["voice_actors"]:
        actor_id = a["actor_id"]
        _id_number(actor_id)
        if actor_id in people:
            raise SystemExit(f"data.json に重複したIDがあります: {actor_id}")
        if _norm_name(a["name"]) in names:
            raise SystemExit(f"data.json に重複した名前があります: {a['name']}")
        names.add(_norm_name(a["name"]))
        people[actor_id] = {"name": a["name"], "kana": _norm_reading(a.get("reading"), a["name"]), "aliases": [],
                            "annict_person_ids": [], "first_seen": data["season"], "last_seen": data["season"],
                            "status": "active", "redirect_to": None}
    registry = {"version": 1, "people": dict(sorted(people.items(), key=lambda kv: _id_number(kv[0])))}
    write_json(people_path, registry)
    if not os.path.exists(OVERRIDES_PATH):
        write_json(OVERRIDES_PATH, empty_overrides())
    print(f"{people_path}: {len(people)}名を登録しました（{min(people)}〜{max(people)}）")


if __name__ == "__main__":
    if sys.argv[1:] == ["bootstrap"]:
        bootstrap()
    else:
        print(__doc__)
        sys.exit(1)
