#!/usr/bin/env python3
"""Annict(軸) + AniList + しょぼいカレンダーを取得し、網羅率だけを報告する。data.json は作らない。
準備:  pip install requests beautifulsoup4
実行:  export ANNICT_TOKEN='（Annictの個人用アクセストークン）'   # 環境変数で渡す。コードやGitに書かない
       python3 coverage_report.py [--refresh]
出力:  画面に10行ほどの要約 / cache/ に取得結果（2回目以降はキャッシュを使う）/ coverage_missing.csv に声優情報が無い作品の一覧
"""
import argparse, csv, difflib, json, os, re, sys, time
import base64, binascii
from datetime import date, timedelta
from data_normalization import canonical_title, load_title_aliases, title_key

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
_ANNICT_VOD_HOSTS = {
    "amazon.co.jp": "Amazon Prime Video",
    "video.unext.jp": "U-NEXT",
    "disneyplus.com": "Disney+",
    "animestore.docomo.ne.jp": "dアニメストア",
    "animehodai.jp": "アニメ放題",
    "abema.tv": "ABEMA",
    "netflix.com": "Netflix",
    "animetimes.com": "アニメタイムズ",
    "tv.dmm.com": "DMM TV",
    "hulu.jp": "Hulu",
}
_ANNICT_VOD_ORDER = [
    "Amazon Prime Video", "U-NEXT", "Disney+", "dアニメストア", "アニメ放題",
    "ABEMA", "Netflix", "アニメタイムズ", "DMM TV", "Hulu",
]


def extract_annict_vods(html):
    from bs4 import BeautifulSoup
    from urllib.parse import urlsplit

    soup = BeautifulSoup(html, "html.parser")
    providers = set()
    for anchor in soup.select("a[href]"):
        host = (urlsplit(anchor["href"]).hostname or "").lower()
        provider = next(
            (name for domain, name in _ANNICT_VOD_HOSTS.items()
             if host == domain or host.endswith("." + domain)),
            None,
        )
        if provider:
            providers.add(provider)
    return [provider for provider in _ANNICT_VOD_ORDER if provider in providers]


def extract_official_thumbnail(html, page_url):
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin, urlsplit

    soup = BeautifulSoup(html, "html.parser")
    image = soup.select_one('meta[property="og:image"][content]')
    thumbnail = urljoin(page_url, image["content"]) if image else None
    if thumbnail and urlsplit(thumbnail).scheme != "https":
        thumbnail = None
    return thumbnail


def annict_work_number(work_id):
    value = str(work_id)
    if value.isdecimal():
        return value
    try:
        decoded = base64.b64decode(value, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise ValueError(f"Invalid Annict work ID: {work_id!r}") from None
    match = re.fullmatch(r"Work-(\d+)", decoded)
    if not match:
        raise ValueError(f"Invalid Annict work ID: {work_id!r}")
    return match.group(1)


def fetch_annict():
    token = os.environ.get("ANNICT_TOKEN")
    if not token:
        raise RuntimeError("環境変数 ANNICT_TOKEN が未設定")
    import requests
    from discover_vod_candidates import OfficialPageFetcher

    session = requests.Session()
    session.headers.update(UA)
    official_pages = OfficialPageFetcher()

    def fetch_work_vods(work_id):
        url = f"https://annict.com/works/{annict_work_number(work_id)}"
        response = session.get(url, timeout=30)
        response.raise_for_status()
        return extract_annict_vods(response.text)

    def fetch_official_thumbnail(official_url, title):
        if not official_url:
            return None
        try:
            html, final_url = official_pages.get(official_url)
            return extract_official_thumbnail(html, final_url)
        except (requests.RequestException, PermissionError, ValueError) as exc:
            print(f"  [thumbnail] 公式サイトから取得できませんでした ({title}): {exc}", file=sys.stderr)
            return None

    q = """query($s:[String!],$a:String){searchWorks(seasons:$s,first:30,after:$a,orderBy:{field:WATCHERS_COUNT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{id title malAnimeId syobocalTid officialSiteUrl casts(first:40){nodes{name person{name nameKana} character{name}}}}}}"""
    out, after = [], None
    while True:
        d = post("https://api.annict.com/graphql", {"query": q, "variables": {"s": [SEASON], "a": after}},
                 {"Authorization": f"Bearer {token}"})["searchWorks"]
        for w in d["nodes"]:
            cast = [[(c["character"] or {}).get("name", ""), (c["person"] or {}).get("name") or c["name"], (c["person"] or {}).get("nameKana") or ""] for c in w["casts"]["nodes"]]
            vods = fetch_work_vods(w["id"])
            thumbnail = fetch_official_thumbnail(w["officialSiteUrl"], w["title"])
            out.append({"annict_id": w["id"], "title": w["title"], "mal": w["malAnimeId"],
                        "tid": w["syobocalTid"], "official": w["officialSiteUrl"],
                        "vods": vods, "thumbnail": thumbnail, "thumbnail_source": "official_site",
                        "cast": [c for c in cast if c[1]]})
            time.sleep(1)
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

# ---- 統合 ----
def merge(sources, title_aliases=None):
    title_aliases = load_title_aliases() if title_aliases is None else title_aliases
    works = []
    def find(w):
        key = title_key(canonical_title(w["title"], title_aliases))
        for x in works:
            if (w["mal"] and x["mal"] == w["mal"]) or (w["tid"] and x["tid"] == w["tid"]) or x["nt"] == key:
                return x
        m = difflib.get_close_matches(key, [x["nt"] for x in works], n=1, cutoff=0.86)
        return next((x for x in works if m and x["nt"] == m[0]), None)
    for src, items in sources.items():
        for w in items:
            x = find(w)
            if not x:
                title = canonical_title(w["title"], title_aliases)
                x = {"title": title, "nt": title_key(title), "mal": None, "tid": None, "casts": {}, "src": set()}
                works.append(x)
            x["mal"] = x["mal"] or w["mal"]; x["tid"] = x["tid"] or w["tid"]
            x["official"] = x.get("official") or w.get("official")
            x["thumbnail"] = x.get("thumbnail") or w.get("thumbnail")
            x["vods"] = list(dict.fromkeys([*(x.get("vods") or []), *(w.get("vods") or [])]))
            x["src"].add(src)
            casts = x["casts"].setdefault(src, [])
            casts.extend(c for c in w["cast"] if c not in casts)
    return works

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--refresh", action="store_true"); a = ap.parse_args()
    fetchers = {"annict": fetch_annict, "anilist": fetch_anilist, "syoboi": fetch_syoboi}
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
    for k in ("annict", "anilist"):
        only = sum(1 for w in works if w["casts"].get(k) and not any(v for s, v in w["casts"].items() if s != k))
        print(f"■ {k}だけが声優情報を持つ作品: {only}")
    with open("coverage_missing.csv", "w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows([["title", "sources"], *[[w["title"], "+".join(sorted(w["src"]))] for w in works if not has(w)]])
    print("→ 声優情報なしの一覧: coverage_missing.csv")

if __name__ == "__main__":
    main()
