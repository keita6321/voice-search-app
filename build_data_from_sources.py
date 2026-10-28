#!/usr/bin/env python3
"""Annict の取得結果だけを使って data.json を作る。
実行: ANNICT_TOKEN を設定して  python3 build_data_from_sources.py
  ・有効なAnnictキャッシュを使う。最新データを取り直す場合は --refresh を指定する
  ・声優情報が1名も無い作品は data.json に入れない（一覧は coverage_missing.csv）
  ・読み: readings.csv > Annictの読み仮名 > pykakasi（あれば）の順。不明な名前は readings_todo.csv に出力"""
import argparse, csv, hashlib, json, os, re, tempfile, unicodedata
from datetime import datetime, timezone
import coverage_report as cr
from data_normalization import apply_vod_overrides, is_supported_actor_name, load_title_aliases, write_vod_audit
from vod_providers import VOD_PROVIDERS

SEASON, MAX_ROLES = cr.SEASON, 24

def stale_annict_cache():
    path = "cache/annict.json"
    if not os.path.exists(path):
        return True
    with open(path, encoding="utf-8") as f:
        records = json.load(f)
    return not records or any(
        not {"annict_id", "vods", "thumbnail", "cast"} <= record.keys()
        or record.get("thumbnail_source") != "official_site"
        for record in records
    )

def hira(s):
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", "".join(chr(ord(c) - 96) if "ァ" <= c <= "ヶ" else c for c in s))

def pick_cast(w, kana):
    """Annict のキャストを採用し、同一声優の別役を「／」で連結する。"""
    roles = {}
    for c in w["casts"].get("annict", []):
        role, name = (c[0] or "").strip(), re.sub(r"\s+", "", c[1] or "")
        if not name or not is_supported_actor_name(name):
            continue
        if len(c) > 2 and c[2]:
            kana.setdefault(name, hira(c[2]))
        if name not in roles:
            roles[name] = [role]
        elif role and role not in roles[name]:
            roles[name].append(role)
    return [(("／".join(r for r in rs if r)) or "（役名未登録）", n) for n, rs in roles.items()][:MAX_ROLES]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Fetch fresh data from Annict instead of using a valid cache")
    args = parser.parse_args()
    annict = cr.cached("annict", cr.fetch_annict, args.refresh or stale_annict_cache())
    if not annict:
        raise RuntimeError("Annict から作品データを取得できなかったため、既存の data.json は変更していません")
    works = cr.merge({"annict": annict}, load_title_aliases())
    apply_vod_overrides(works, VOD_PROVIDERS)

    reading = {}
    if os.path.exists("readings.csv"):
        reading = {r["name"]: r["reading"] for r in csv.DictReader(open("readings.csv", encoding="utf-8"))}
    try:
        import pykakasi
        kks = pykakasi.kakasi(); auto = lambda n: "".join(x["hira"] for x in kks.convert(n))
    except ImportError:
        auto = lambda n: ""
    kana, todo = {}, {}
    out_works, actors, missing, vod_audit = {}, {}, [], []
    for w in works:
        cast = pick_cast(w, kana)
        if not cast:
            missing.append(w); continue
        wid = "w" + hashlib.md5(w["nt"].encode()).hexdigest()[:8]
        out_works[wid] = {"title": w["title"], "thumbnail": w.get("thumbnail"), "credit": None, "official_url": w.get("official"),
                          "airing_confirmed": False,
                          "vod_links": [{"provider": p, "url": VOD_PROVIDERS[p]} for p in (w.get("vods") or []) if p in VOD_PROVIDERS]}
        if not out_works[wid]["vod_links"]:
            vod_audit.append((w["title"], w.get("official") or "", "+".join(sorted(w["src"]))))
        for n, (role, name) in enumerate(cast, 1):
            r = reading.get(name) or kana.get(name) or auto(name)
            if name not in reading:
                todo[name] = r
            cid = f"{wid}-{n}"
            a = actors.setdefault(name, {"name": name, "reading": r or name, "roles": []})
            a["roles"].append({"work_id": wid, "character_id": cid, "character_name": role, "image": cr_img("characters", cid)})
    va = sorted(actors.values(), key=lambda a: a["reading"])
    va = [{"actor_id": f"va{i:04d}", **a} for i, a in enumerate(va, 1)]
    data = {"season": SEASON, "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "works": out_works, "voice_actors": va}
    fd, temp_path = tempfile.mkstemp(prefix="data.", suffix=".json", dir=".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(temp_path, "data.json")
    except Exception:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise
    csv.writer(open("readings_todo.csv", "w", encoding="utf-8", newline="")).writerows([["name", "reading(自動)"], *sorted(todo.items())])
    csv.writer(open("coverage_missing.csv", "w", encoding="utf-8", newline="")).writerows([["title", "sources"], *[[w["title"], "+".join(sorted(w["src"]))] for w in missing]])
    write_vod_audit(vod_audit)
    novod = sum(1 for x in out_works.values() if not x["vod_links"])
    print(f"data.json: {len(out_works)}作品 / {len(va)}名（声優情報なしで除外 {len(missing)}作品）")
    print(f"配信先なし {novod}作品 / 公式サイトなし {sum(1 for x in out_works.values() if not x['official_url'])}作品 / 読み未登録 {len(todo)}名 → readings_todo.csv / vod_audit.csv")

def cr_img(kind, key):
    for ext in ("webp", "jpg", "png"):
        path = f"images/{kind}/{key}.{ext}"
        if os.path.exists(path):
            return path
    return None

if __name__ == "__main__":
    main()
