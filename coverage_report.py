#!/usr/bin/env python3
"""Annict(軸) + AniList + しょぼいカレンダー + 電ファミ記事 を取得し、網羅率だけを報告する。data.json は作らない。
準備:  pip install requests beautifulsoup4     ※ crawl.py と同じフォルダに置く
実行:  export ANNICT_TOKEN='（Annictの個人用アクセストークン）'   # 環境変数で渡す。コードやGitに書かない
       python3 coverage_report.py [--refresh]
出力:  画面に10行ほどの要約 / cache/ に取得結果（2回目以降はキャッシュを使う）/ coverage_missing.csv に声優情報が無い作品の一覧
"""
import argparse, csv, difflib, json, os, re, sys, time, unicodedata
from datetime import date, timedelta

SEASON, YEAR, AL_SEASON = "2026-autumn", 2026, "FALL"
UA = {"User-Agent": "anime-va-search/1.0 (personal project)"}
os.makedirs("cache", exist_ok=True)

def cached(name, fn, refresh):
    p = f"cache/{name}.json"
    if os.path.exists(p) and not refresh:
        return json.load(open(p, encoding="utf-8"))
    try:
        data = fn()
    except Exception as e:
        print(f"  [{name}] 取得失敗: {e}", file=sys.stderr); return []
    json.dump(data, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    return data

def post(url, payload, headers=None):
    import requests
    r = requests.post(url, json=payload, headers={**UA, **(headers or {})}, timeout=60)
    if r.status_code == 429:
        time.sleep(65); r = requests.post(url, json=payload, headers={**UA, **(headers or {})}, timeout=60)
    r.raise_for_status(); j = r.json()
    if j.get("errors"):
        raise RuntimeError(json.dumps(j["errors"], ensure_ascii=False)[:400])
    return j["data"]

def getj(url, params):
    import requests
    r = requests.get(url, params=params, headers=UA, timeout=60); r.raise_for_status(); return r.json()

def vals(x):
    return list(x.values()) if isinstance(x, dict) else (x or [])

# ---- Annict（軸）----
def fetch_annict():
    token = os.environ.get("ANNICT_TOKEN")
    if not token:
        raise RuntimeError("環境変数 ANNICT_TOKEN が未設定")
    q = """query($s:[String!],$a:String){searchWorks(seasons:$s,first:30,after:$a,orderBy:{field:WATCHERS_COUNT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{title malAnimeId syobocalTid officialSiteUrl casts(first:40){nodes{name person{name nameKana} character{name}}}}}}"""
    out, after = [], None
    while True:
        d = post("https://api.annict.com/graphql", {"query": q, "variables": {"s": [SEASON], "a": after}},
                 {"Authorization": f"Bearer {token}"})["searchWorks"]
        for w in d["nodes"]:
            cast = [[(c["character"] or {}).get("name", ""), (c["person"] or {}).get("name") or c["name"], (c["person"] or {}).get("nameKana") or ""] for c in w["casts"]["nodes"]]
            out.append({"title": w["title"], "mal": w["malAnimeId"], "tid": w["syobocalTid"], "official": w["officialSiteUrl"], "cast": [c for c in cast if c[1]]})
        if not d["pageInfo"]["hasNextPage"]:
            return out
        after = d["pageInfo"]["endCursor"]; time.sleep(1)

# ---- AniList（補完）----
def fetch_anilist():
    q = """query($p:Int){Page(page:$p,perPage:25){pageInfo{hasNextPage}
      media(season:%s,seasonYear:%d,type:ANIME){idMal title{native romaji}
        characters(sort:[ROLE,RELEVANCE],perPage:20){edges{node{name{native full}} voiceActors(language:JAPANESE){name{native full}}}}}}}""" % (AL_SEASON, YEAR)
    out, p = [], 1
    while True:
        d = post("https://graphql.anilist.co", {"query": q, "variables": {"p": p}})["Page"]
        for m in d["media"]:
            cast = [[e["node"]["name"]["native"] or e["node"]["name"]["full"], v["name"]["native"] or v["name"]["full"]]
                    for e in m["characters"]["edges"] for v in e["voiceActors"]]
            out.append({"title": m["title"]["native"] or m["title"]["romaji"], "mal": m["idMal"], "tid": None, "cast": cast})
        if not d["pageInfo"]["hasNextPage"]:
            return out
        p += 1; time.sleep(3)

# ---- しょぼいカレンダー（放送中の判定。キャストは持たない）----
def fetch_syoboi():
    start = (date.today() - timedelta(days=3)).strftime("%Y-%m-%d_000000")
    tids = sorted({int(p["TID"]) for p in vals(getj("https://cal.syoboi.jp/json.php", {"Req": "ProgramByDate", "Start": start, "Days": 10}).get("Programs"))})
    out = []
    for i in range(0, len(tids), 50):
        t = getj("https://cal.syoboi.jp/json.php", {"Req": "TitleMedium", "TID": ",".join(map(str, tids[i:i + 50]))}).get("Titles")
        for x in vals(t):
            if str(x.get("Cat")) == "1" and str(x.get("FirstYear")) == str(YEAR) and int(x.get("FirstMonth") or 0) >= 9:
                out.append({"title": x["Title"], "mal": None, "tid": int(x["TID"]), "cast": []})
        time.sleep(1)
    return out

# ---- 電ファミ記事（crawl.py を再利用）----
def fetch_denfami():
    import crawl
    out = []
    for i in crawl.PAGES:
        for w in crawl.parse_page(crawl.get(crawl.BASE if i == 1 else f"{crawl.BASE}/{i}"), 99):
            out.append({"title": w["title"], "mal": None, "tid": None, "official": w["official_url"], "vods": w["vods"], "cast": w["cast"]})
        time.sleep(2)
    return out

# ---- 統合 ----
nt = lambda s: re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", s).lower())

def merge(sources):
    works = []
    def find(w):
        for x in works:
            if (w["mal"] and x["mal"] == w["mal"]) or (w["tid"] and x["tid"] == w["tid"]) or x["nt"] == nt(w["title"]):
                return x
        m = difflib.get_close_matches(nt(w["title"]), [x["nt"] for x in works], n=1, cutoff=0.86)
        return next((x for x in works if m and x["nt"] == m[0]), None)
    for src, items in sources.items():
        for w in items:
            x = find(w)
            if not x:
                x = {"title": w["title"], "nt": nt(w["title"]), "mal": None, "tid": None, "casts": {}, "src": set()}
                works.append(x)
            x["mal"] = x["mal"] or w["mal"]; x["tid"] = x["tid"] or w["tid"]
            x["official"] = x.get("official") or w.get("official"); x["vods"] = x.get("vods") or w.get("vods")
            x["src"].add(src); x["casts"][src] = w["cast"]
    return works

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--refresh", action="store_true"); a = ap.parse_args()
    fetchers = {"annict": fetch_annict, "anilist": fetch_anilist, "syoboi": fetch_syoboi, "denfami": fetch_denfami}
    src = {k: cached(k, f, a.refresh) for k, f in fetchers.items()}
    works = merge(src)
    has = lambda w: any(w["casts"].values())
    n, ok = len(works), sum(map(has, works))
    air = [w for w in works if "syoboi" in w["src"]]
    pct = lambda a_, b_: f"{100 * a_ / b_:.1f}%" if b_ else "-"
    print("■ 取得作品数（ソース別）: " + " / ".join(f"{k} {len(v)}" for k, v in src.items()))
    print(f"■ 統合後の作品数: {n}")
    print(f"■ 声優情報あり: {ok} ({pct(ok, n)})　なし: {n - ok} ({pct(n - ok, n)})")
    print(f"■ うち放送確認済み(しょぼいカレンダー): {len(air)}作品 / 声優なし {sum(not has(w) for w in air)} ({pct(sum(not has(w) for w in air), len(air))})")
    for k in ("annict", "anilist", "denfami"):
        only = sum(1 for w in works if w["casts"].get(k) and not any(v for s, v in w["casts"].items() if s != k))
        print(f"■ {k}だけが声優情報を持つ作品: {only}")
    with open("coverage_missing.csv", "w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows([["title", "sources"], *[[w["title"], "+".join(sorted(w["src"]))] for w in works if not has(w)]])
    print("→ 声優情報なしの一覧: coverage_missing.csv")

if __name__ == "__main__":
    main()
