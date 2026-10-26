#!/usr/bin/env python3
"""今期アニメのキャスト・配信先を「電ファミの秋アニメまとめ」記事から取得して data.json を作る。

準備:  pip install requests beautifulsoup4      （読みを自動付与するなら pykakasi も）
実行:  python3 crawl.py [--max-roles 12]
使うファイル:
  readings.csv      声優名,読み（ひらがな）。ここに無い名前は readings_todo.csv に出力 → 読みを直して readings.csv に追記
  manual_works.json 記事に載っていない作品の手動追加分（同名の作品は記事側を優先）
クールが変わったら SEASON と BASE（記事URL）を差し替える。※サイトの利用規約・robots.txt を確認し、アクセス間隔は空けること
"""
import argparse, csv, hashlib, json, os, re, sys, time
from datetime import date, datetime, timezone
from bs4 import BeautifulSoup
from data_normalization import is_supported_actor_name, load_title_aliases, merge_work_variants

SEASON = "2026-autumn"
BASE = "https://news.denfaminicogamer.jp/kikakuthetower/261001g"
PAGES = range(1, 8)

# 送客先。url は各社トップのプレースホルダー → アフィリエイトURLに置換する
PROV = {
    "Amazon Prime Video": "https://www.amazon.co.jp/primevideo", "U-NEXT": "https://video.unext.jp",
    "dアニメストア": "https://animestore.docomo.ne.jp", "アニメ放題": "https://animehodai.jp",
    "ABEMA": "https://abema.tv", "Netflix": "https://www.netflix.com/jp", "アニメタイムズ": "https://animetimes.com",
    "DMM TV": "https://tv.dmm.com", "Hulu": "https://www.hulu.jp",
}
SCAN = {"Prime Video": "Amazon Prime Video", **{k: k for k in PROV if k != "Amazon Prime Video"}}

def get(url):
    import requests
    r = requests.get(url, headers={"User-Agent": "anime-va-search/1.0 (personal project)"}, timeout=30)
    r.raise_for_status(); r.encoding = "utf-8"
    return r.text

def parse_page(html, max_roles):
    """見出し(h2)が『作品名』で始まる区間を1作品として読む。"""
    works = []
    for h in BeautifulSoup(html, "html.parser").find_all("h2"):
        head = h.get_text(strip=True)
        m = re.match(r"『(.+?)』", head)
        if not m:
            continue
        body = []
        for sib in h.next_siblings:
            if getattr(sib, "name", None) == "h2":
                break
            body.append(sib)
        text = "\n".join(s.get_text("\n") if hasattr(s, "get_text") else str(s) for s in body)
        text = re.sub(r"[\u200b-\u200d\ufeff]", "", text)
        d = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", head)
        if d and date(*map(int, d.groups())) > date.today():
            print(f"  配信前のため除外: {m.group(1)}"); continue
        cm = re.search(r"【キャスト】(.*?)(?=【|\Z)", text, re.S)
        cast = []
        for ln in (cm.group(1).splitlines() if cm else []):
            if "：" not in ln:
                continue
            role, name = ln.strip().split("：", 1)
            name = re.sub(r"\s+", "", re.sub(r"[（(].*?[）)]", "", name))
            if role.strip() and is_supported_actor_name(name):
                cast.append([role.strip(), name])
        if not cast:
            print(f"  キャスト無しのため除外: {m.group(1)}"); continue
        vm = re.search(r"【[^】]*配信[^】]*】(.*?)(?=【|\Z)", text, re.S)
        vods = sorted({SCAN[k] for k in SCAN if vm and k in vm.group(1)}, key=list(PROV).index)
        links = [a["href"] for s in body if hasattr(s, "find_all") for a in s.find_all("a", href=True)]
        ext = [u for u in links if u.startswith("http") and "denfaminicogamer" not in u and "attachment" not in u]
        works.append({"title": m.group(1), "vods": vods, "official_url": ext[-1] if ext else None, "cast": cast[:max_roles]})
    return works

def img(kind, key):
    for ext in ("webp", "jpg", "png"):
        p = f"images/{kind}/{key}.{ext}"
        if os.path.exists(p):
            return p
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--max-roles", type=int, default=12); a = ap.parse_args()
    works = []
    for i in PAGES:
        url = BASE if i == 1 else f"{BASE}/{i}"
        print(f"取得中: {url}")
        try:
            works += parse_page(get(url), a.max_roles)
        except Exception as e:
            print(f"  失敗: {e}", file=sys.stderr)
        time.sleep(2)
    titles = {w["title"] for w in works}
    if os.path.exists("manual_works.json"):
        works += [w for w in json.load(open("manual_works.json", encoding="utf-8")) if w["title"] not in titles]
    works = merge_work_variants(works, load_title_aliases())

    reading = {}
    if os.path.exists("readings.csv"):
        reading = {r["name"]: r["reading"] for r in csv.DictReader(open("readings.csv", encoding="utf-8"))}
    try:
        import pykakasi
        kks = pykakasi.kakasi(); auto = lambda n: "".join(x["hira"] for x in kks.convert(n))
    except ImportError:
        auto = lambda n: n
    todo = {}

    out_works, actors = {}, {}
    for w in works:
        cast = [(role, name) for role, name in w["cast"] if is_supported_actor_name(name)]
        if not cast:
            continue
        wid = w.get("id") or "w" + hashlib.md5(w["title"].encode()).hexdigest()[:8]
        out_works[wid] = {"title": w["title"], "thumbnail": img("works", wid), "credit": None, "official_url": w.get("official_url"),
                          "vod_links": [{"provider": p, "url": PROV[p]} for p in w["vods"] if p in PROV]}
        cast_by_name = {}
        for role, name in cast:
            roles = cast_by_name.setdefault(name, [])
            if role not in roles:
                roles.append(role)
        for n, (name, roles) in enumerate(cast_by_name.items(), 1):
            if name not in reading:
                todo[name] = auto(name)
            cid = f"{wid}-{n}"
            act = actors.setdefault(name, {"name": name, "reading": reading.get(name) or todo[name], "roles": []})
            act["roles"].append({"work_id": wid, "character_id": cid, "character_name": "／".join(roles), "image": img("characters", cid)})
    va = sorted(actors.values(), key=lambda x: x["reading"])
    va = [{"actor_id": f"va{i:04d}", **x} for i, x in enumerate(va, 1)]
    json.dump({"season": SEASON, "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "works": out_works, "voice_actors": va}, open("data.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    if todo:
        csv.writer(open("readings_todo.csv", "w", encoding="utf-8", newline="")).writerows([["name", "reading"], *sorted(todo.items())])
    print(f"{len(out_works)}作品 / {len(va)}名 を出力。読み未登録 {len(todo)}名 → readings_todo.csv（直して readings.csv に追記）")

if __name__ == "__main__":
    main()
