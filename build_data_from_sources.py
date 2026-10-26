#!/usr/bin/env python3
"""cache/ の取得結果（Annict軸 + AniList + しょぼいカレンダー + 電ファミ）を統合して data.json を作る。
実行: ANNICT_TOKEN を設定して  python3 build_data_from_sources.py
  ・キャッシュに公式サイトURL等が無い場合（旧版のキャッシュ）は、その取得元だけ自動で取り直す
  ・声優情報が1名も無い作品は data.json に入れない（一覧は coverage_missing.csv）
  ・読み: readings.csv > Annictの読み仮名 > pykakasi（あれば）の順。不明な名前は readings_todo.csv に出力"""
import csv, hashlib, json, os, re, unicodedata
from datetime import datetime, timezone
import coverage_report as cr, crawl
from data_normalization import is_supported_actor_name, load_title_aliases

SEASON, MAX_ROLES = cr.SEASON, 24

def stale(name, key):
    p = f"cache/{name}.json"
    if not os.path.exists(p):
        return True
    d = json.load(open(p, encoding="utf-8"))
    return bool(d) and key not in d[0]

def hira(s):
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", "".join(chr(ord(c) - 96) if "ァ" <= c <= "ヶ" else c for c in s))

def pick_cast(w, kana):
    """電ファミ → Annict → AniList の順で採用。声優の重複は1名にまとめ、同一ソース内の別役は「／」で連結。"""
    roles, origin = {}, {}
    for s in ("denfami", "annict", "anilist"):
        for c in w["casts"].get(s, []):
            role, name = (c[0] or "").strip(), re.sub(r"\s+", "", c[1] or "")
            if not name or not is_supported_actor_name(name):
                continue
            if len(c) > 2 and c[2]:
                kana.setdefault(name, hira(c[2]))
            if name not in roles:
                roles[name], origin[name] = [role], s
            elif origin[name] == s and role and role not in roles[name]:
                roles[name].append(role)
    return [(("／".join(r for r in rs if r)) or "（役名未登録）", n) for n, rs in roles.items()][:MAX_ROLES]

def main():
    spec = {"annict": (cr.fetch_annict, "official"), "anilist": (cr.fetch_anilist, "cast"),
            "syoboi": (cr.fetch_syoboi, "cast"), "denfami": (cr.fetch_denfami, "official")}
    src = {k: cr.cached(k, f, stale(k, key)) for k, (f, key) in spec.items()}
    works = cr.merge(src, load_title_aliases())

    reading = {}
    if os.path.exists("readings.csv"):
        reading = {r["name"]: r["reading"] for r in csv.DictReader(open("readings.csv", encoding="utf-8"))}
    try:
        import pykakasi
        kks = pykakasi.kakasi(); auto = lambda n: "".join(x["hira"] for x in kks.convert(n))
    except ImportError:
        auto = lambda n: ""
    kana, todo = {}, {}
    out_works, actors, missing = {}, {}, []
    for w in works:
        cast = pick_cast(w, kana)
        if not cast:
            missing.append(w); continue
        wid = "w" + hashlib.md5(w["nt"].encode()).hexdigest()[:8]
        out_works[wid] = {"title": w["title"], "thumbnail": cr_img("works", wid), "credit": None, "official_url": w.get("official"),
                          "airing_confirmed": "syoboi" in w["src"],
                          "vod_links": [{"provider": p, "url": crawl.PROV[p]} for p in (w.get("vods") or []) if p in crawl.PROV]}
        for n, (role, name) in enumerate(cast, 1):
            r = reading.get(name) or kana.get(name) or auto(name)
            if name not in reading:
                todo[name] = r
            cid = f"{wid}-{n}"
            a = actors.setdefault(name, {"name": name, "reading": r or name, "roles": []})
            a["roles"].append({"work_id": wid, "character_id": cid, "character_name": role, "image": cr_img("characters", cid)})
    va = sorted(actors.values(), key=lambda a: a["reading"])
    va = [{"actor_id": f"va{i:04d}", **a} for i, a in enumerate(va, 1)]
    json.dump({"season": SEASON, "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "works": out_works, "voice_actors": va}, open("data.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    csv.writer(open("readings_todo.csv", "w", encoding="utf-8", newline="")).writerows([["name", "reading(自動)"], *sorted(todo.items())])
    csv.writer(open("coverage_missing.csv", "w", encoding="utf-8", newline="")).writerows([["title", "sources"], *[[w["title"], "+".join(sorted(w["src"]))] for w in missing]])
    novod = sum(1 for x in out_works.values() if not x["vod_links"])
    print(f"data.json: {len(out_works)}作品 / {len(va)}名（声優情報なしで除外 {len(missing)}作品）")
    print(f"配信先なし {novod}作品 / 公式サイトなし {sum(1 for x in out_works.values() if not x['official_url'])}作品 / 読み未登録 {len(todo)}名 → readings_todo.csv")

def cr_img(kind, key):
    for ext in ("webp", "jpg", "png"):
        p = f"images/{kind}/{key}.{ext}"
        if os.path.exists(p):
            return p
    return None

if __name__ == "__main__":
    main()
