"""声優ごとの「主な過去の出演作」を AniList から取る。

実行: python3 past_works.py [--max-minutes 15] [--max-age-days 28]
- 今期（data.json）と来期（data-next.json）の声優が対象
- AniList で日本語名が完全一致する人だけを使う（同名の別人を出さないため。見つからなければ空のまま）
- 人気順に並べ、同じシリーズは一番人気の1作だけ、今期・来期の作品は除いて上位8作を残す
- 結果は data/past-works.json。取得から max-age-days 日たった人だけ取り直す（AniList の回数制限があるため）
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import date, timedelta

PATH = "data/past-works.json"
TOP_N = 8
KEEP_FORMATS = {"TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL"}
SEASON_NAMES = {"winter": "WINTER", "spring": "SPRING", "summer": "SUMMER", "autumn": "FALL"}

QUERY = """query($q:String){Page(perPage:5){staff(search:$q){id name{native full alternative}
  characterMedia(sort:POPULARITY_DESC,perPage:40){edges{characters{name{native full}}
    node{id title{native romaji} seasonYear season startDate{year} format status isAdult popularity}}}}}}"""


def norm_name(s):
    return re.sub(r"[\s　・=＝]", "", s or "")


def norm_title(s):
    return re.sub(r"[\s　!！?？:：・\-－〜~]", "", (s or "")).lower()


def series_key(title):
    """シリーズをまとめるための見出し。「鬼滅の刃 遊郭編」と「鬼滅の刃」を同じに扱う。"""
    t = re.sub(r"^(劇場版|映画)\s*", "", title or "")
    head = re.split(r"[\s　:：（(「]", t, maxsplit=1)[0]
    head = re.sub(r"(第?[0-9０-９]+期|[0-9０-９]+(st|nd|rd|th)?)$", "", head)
    return norm_title(head if len(head) >= 4 else t)


def pick_staff(candidates, name):
    want = norm_name(name)
    for s in candidates or []:
        n = s.get("name") or {}
        names = [n.get("native")] + list(n.get("alternative") or [])
        if any(norm_name(x) == want for x in names if x):
            return s
    return None


def select_past(staff, exclude_titles, exclude_seasons, top_n=TOP_N):
    out, seen_series, seen_ids = [], set(), set()
    for edge in ((staff or {}).get("characterMedia") or {}).get("edges") or []:
        m = edge.get("node") or {}
        if not m or m.get("isAdult") or m.get("format") not in KEEP_FORMATS or m.get("status") == "NOT_YET_RELEASED":
            continue
        if (m.get("seasonYear"), m.get("season")) in exclude_seasons:
            continue
        title = (m.get("title") or {}).get("native") or (m.get("title") or {}).get("romaji")
        if not title or norm_title(title) in exclude_titles or m.get("id") in seen_ids:
            continue
        key = series_key(title)
        if key in seen_series:
            continue
        seen_series.add(key); seen_ids.add(m.get("id"))
        chars = [(c.get("name") or {}).get("native") or (c.get("name") or {}).get("full") for c in edge.get("characters") or []]
        out.append({"title": title, "year": m.get("seasonYear") or (m.get("startDate") or {}).get("year"),
                    "format": m.get("format"), "character": "、".join(c for c in chars if c)[:40],
                    "anilist_id": m.get("id")})
        if len(out) >= top_n:
            break
    return out


def season_tuple(season):
    year, name = season.split("-")
    return (int(year), SEASON_NAMES[name])


def targets(paths=("data.json", "data-next.json")):
    actors, titles, seasons = {}, set(), set()
    for p in paths:
        if not os.path.exists(p):
            continue
        d = json.load(open(p, encoding="utf-8"))
        if d.get("season"):
            seasons.add(season_tuple(d["season"]))
        works = d["works"].values() if isinstance(d["works"], dict) else d["works"]
        titles.update(norm_title(w["title"]) for w in works)
        for a in d["voice_actors"]:
            actors.setdefault(a["actor_id"], a["name"])
    return actors, titles, seasons


def due(entry, today, max_age_days):
    if not entry or not entry.get("fetched"):
        return True
    return date.fromisoformat(entry["fetched"]) <= today - timedelta(days=max_age_days)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-minutes", type=float, default=15)
    ap.add_argument("--max-age-days", type=int, default=28)
    args = ap.parse_args()
    import coverage_report as cr

    store = json.load(open(PATH, encoding="utf-8")) if os.path.exists(PATH) else {"version": 1, "actors": {}}
    actors, titles, seasons = targets()
    today = date.today()
    todo = [aid for aid in sorted(actors) if due(store["actors"].get(aid), today, args.max_age_days)]
    # 取ったことのない人を先に
    todo.sort(key=lambda aid: (aid in store["actors"], store["actors"].get(aid, {}).get("fetched", "")))
    deadline = time.time() + args.max_minutes * 60
    done = found = 0
    for aid in todo:
        if time.time() > deadline:
            break
        name = actors[aid]
        try:
            cands = cr.post("https://graphql.anilist.co", {"query": QUERY, "variables": {"q": name}})["Page"]["staff"]
        except Exception as exc:  # 1人の失敗で全体を止めない
            print(f"  [past] {name}: 取得失敗 {exc}", file=sys.stderr)
            time.sleep(3)
            continue
        staff = pick_staff(cands, name)
        works = select_past(staff, titles, seasons) if staff else []
        store["actors"][aid] = {"name": name, "anilist_id": staff and staff["id"], "fetched": today.isoformat(), "works": works}
        done += 1; found += bool(works)
        time.sleep(2.1)  # AniList は1分あたり30回まで
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    json.dump(store, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    left = len(todo) - done
    have = sum(1 for aid in actors if store["actors"].get(aid, {}).get("works"))
    print(f"過去作: {done}人を取得（うち作品あり {found}人）、残り {left}人。対象 {len(actors)}人中 {have}人に過去作あり")


if __name__ == "__main__":
    main()
