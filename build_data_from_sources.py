#!/usr/bin/env python3
"""Annict の取得結果だけを使って data.json を作る。
実行: ANNICT_TOKEN を設定して  python3 build_data_from_sources.py
  ・有効なAnnictキャッシュを使う。最新データを取り直す場合は --refresh を指定する
  ・声優情報が1名も無い作品は data.json に入れない（一覧は coverage_missing.csv）
  ・読み: readings.csv > Annictの読み仮名 > pykakasi（あれば）の順。不明な名前は readings_todo.csv に出力"""
import argparse, csv, hashlib, json, os, re, tempfile, unicodedata
from datetime import datetime, timezone
import actor_registry as ar
import coverage_report as cr
from data_normalization import apply_vod_overrides, is_supported_actor_name, load_title_aliases, write_vod_audit
from vod_providers import VOD_PROVIDERS

MAX_ROLES = 24

def stale_annict_cache(path):
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

def fill_cast_from_anilist(works, season, refresh):
    """シーズン一覧で突き合わせられず、まだキャストがない作品を、AniListに個別に問い合わせて補う。"""
    targets = [w for w in works if not any(w["casts"].values())]
    if not targets:
        return
    lookup = cr.cached(f"anilist-lookup-{season}", lambda: cr.lookup_anilist_cast(targets), refresh)
    if not isinstance(lookup, dict):
        lookup = {}
    filled = []
    for w in targets:
        hit = lookup.get(w["title"])
        if hit and hit.get("cast"):
            w["casts"]["anilist"] = hit["cast"]
            filled.append((w["title"], hit.get("how"), hit.get("anilist_title")))
    os.makedirs("reports", exist_ok=True)
    lines = [f"# AniListでキャストを補った作品（{season}）", "",
             f"キャストが未登録の{len(targets)}作品のうち、{len(filled)}作品を補いました。",
             "「作品名で検索」は名前の近さで選んでいるので、取り違えがないか確認してください。", "",
             "| 作品（Annict） | 方法 | AniListの作品名 |", "| --- | --- | --- |"]
    lines += [f"| {t} | {'MALのID' if how == 'mal' else '作品名で検索'} | {a} |" for t, how, a in filled]
    still = [w["title"] for w in targets if w["title"] not in {f[0] for f in filled}]
    if still:
        lines += ["", "## まだキャストがない作品", "", *[f"- {t}" for t in still]]
    with open(os.path.join("reports", f"cast-fill-{season}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def pick_cast(w, kana, person_ids=None):
    """Annict のキャストを採用し、同一声優の別役を「／」で連結する。
    Annictにキャストが未登録の作品だけ、AniListのキャストで補う（作品の選定はAnnictが軸のまま）。"""
    roles = {}
    source = w["casts"].get("annict") or w["casts"].get("anilist") or []
    for c in source:
        role, name = (c[0] or "").strip(), re.sub(r"\s+", "", c[1] or "")
        if not name or not is_supported_actor_name(name):
            continue
        if len(c) > 2 and c[2]:
            kana.setdefault(name, hira(c[2]))
        if person_ids is not None and len(c) > 3 and c[3] is not None:
            person_ids.setdefault(name, int(c[3]))
        if name not in roles:
            roles[name] = [role]
        elif role and role not in roles[name]:
            roles[name].append(role)
    return [(("／".join(r for r in rs if r)) or "（役名未登録）", n) for n, rs in roles.items()][:MAX_ROLES]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Fetch fresh data from Annict instead of using a valid cache")
    parser.add_argument("--force-registry", action="store_true",
                        help="声優数が前回の半分未満でも、声優IDの台帳を更新して続行する（取得失敗でないことを確認した場合のみ）")
    parser.add_argument("--season", default=cr.SEASON, help="取得するシーズン（例: 2027-winter）。既定は coverage_report.py の season")
    args = parser.parse_args()
    cr.set_season(args.season)
    season = cr.SEASON
    annict_cache = f"annict-{season}"
    annict = cr.cached(annict_cache, cr.fetch_annict, args.refresh or stale_annict_cache(f"cache/{annict_cache}.json"))
    if not annict:
        raise RuntimeError("Annict から作品データを取得できなかったため、既存の data.json は変更していません")
    # AniList は、Annictにキャストが未登録の作品の補完だけに使う（取得に失敗しても続行）
    anilist = cr.cached(f"anilist-{season}", cr.fetch_anilist, args.refresh)
    works = [w for w in cr.merge({"annict": annict, "anilist": anilist}, load_title_aliases()) if "annict" in w["src"]]
    fill_cast_from_anilist(works, season, args.refresh)
    apply_vod_overrides(works, VOD_PROVIDERS)

    reading = {}
    if os.path.exists("readings.csv"):
        reading = {r["name"]: r["reading"] for r in csv.DictReader(open("readings.csv", encoding="utf-8"))}
    try:
        import pykakasi
        kks = pykakasi.kakasi(); auto = lambda n: "".join(x["hira"] for x in kks.convert(n))
    except ImportError:
        auto = lambda n: ""
    kana, todo, person_ids = {}, {}, {}
    out_works, actors, missing, vod_audit = {}, {}, [], []
    for w in works:
        cast = pick_cast(w, kana, person_ids)
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
    # 声優IDは台帳（data/registry/people.json）から割り当てる。並び順で振り直さない
    registry = ar.load_json(ar.PEOPLE_PATH, None)
    if registry is None:
        raise RuntimeError(f"{ar.PEOPLE_PATH} がありません。初回は python3 actor_registry.py bootstrap を実行してください")
    overrides = ar.load_json(ar.OVERRIDES_PATH, ar.empty_overrides())
    try:
        ids, registry_report = ar.assign(
            registry,
            [{"name": a["name"], "reading": a["reading"], "annict_person_id": person_ids.get(a["name"])} for a in actors.values()],
            season, overrides, force=args.force_registry)
    except ar.RegistryError as exc:
        if exc.review:
            ar.write_json(ar.REVIEW_PATH, {"season": season, "items": exc.review})
        raise RuntimeError(f"声優IDの台帳: {exc}。data.json と台帳は変更していません") from None
    if os.path.exists(ar.REVIEW_PATH):
        os.remove(ar.REVIEW_PATH)
    va = sorted(actors.values(), key=lambda a: (a["reading"], ids[a["name"]]))
    va = [{"actor_id": ids[a["name"]], **a} for a in va]
    data = {"season": season, "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
    ar.write_json(ar.PEOPLE_PATH, registry)
    os.makedirs("reports", exist_ok=True)
    with open(os.path.join("reports", f"registry-{season}.md"), "w", encoding="utf-8") as f:
        f.write(ar.format_report(registry_report, season))
    csv.writer(open("readings_todo.csv", "w", encoding="utf-8", newline="")).writerows([["name", "reading(自動)"], *sorted(todo.items())])
    csv.writer(open("coverage_missing.csv", "w", encoding="utf-8", newline="")).writerows([["title", "sources"], *[[w["title"], "+".join(sorted(w["src"]))] for w in missing]])
    write_vod_audit(vod_audit)
    novod = sum(1 for x in out_works.values() if not x["vod_links"])
    print(f"data.json: {len(out_works)}作品 / {len(va)}名（声優情報なしで除外 {len(missing)}作品）")
    print(f"配信先なし {novod}作品 / 公式サイトなし {sum(1 for x in out_works.values() if not x['official_url'])}作品 / 読み未登録 {len(todo)}名 → readings_todo.csv / vod_audit.csv")
    anilist_filled = sum(1 for w in works if not w["casts"].get("annict") and w["casts"].get("anilist"))
    print(f"キャストをAniListで補った作品: {anilist_filled}作品 / 前クールからの継続作品の判定 → reports/carryover-{season}.md")
    print(f"声優ID台帳: 新規 {len(registry_report['new'])}名 / 名前変更 {len(registry_report['renamed'])}名 / "
          f"今期出演なし {len(registry_report['inactivated'])}名 → reports/registry-{season}.md")

def cr_img(kind, key):
    for ext in ("webp", "jpg", "png"):
        path = f"images/{kind}/{key}.{ext}"
        if os.path.exists(path):
            return path
    return None

if __name__ == "__main__":
    main()
