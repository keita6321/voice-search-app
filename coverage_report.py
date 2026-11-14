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
SEASON_START_MONTH = {"winter": 1, "spring": 4, "summer": 7, "autumn": 10}
ANILIST_SEASON = {"winter": "WINTER", "spring": "SPRING", "summer": "SUMMER", "autumn": "FALL"}
SEASON_ORDER = ["winter", "spring", "summer", "autumn"]
# 前クールから続いている作品とみなす基準：本放送の最新の放送日が、今期の開始日からこの日数以降
# （前クールの最終回が今期の頭にずれ込んだだけの作品を外すため）
CARRYOVER_MIN_DAYS_INTO_SEASON = 28
CARRYOVER_PATH = "season_carryover.csv"


def parse_season(season):
    m = re.fullmatch(r"(\d{4})-(winter|spring|summer|autumn)", season or "")
    if not m:
        raise ValueError(f"シーズンの形式が不正です（例: 2026-autumn）: {season!r}")
    return int(m.group(1)), m.group(2)


def previous_season(season):
    year, name = parse_season(season)
    i = SEASON_ORDER.index(name)
    return f"{year - 1}-autumn" if i == 0 else f"{year}-{SEASON_ORDER[i - 1]}"


def season_start(season):
    year, name = parse_season(season)
    return date(year, SEASON_START_MONTH[name], 1)


def set_season(season):
    """取得対象のシーズンを切り替える（例: 2027-winter）。"""
    global SEASON, YEAR, AL_SEASON
    year, name = parse_season(season)
    SEASON, YEAR, AL_SEASON = season, year, ANILIST_SEASON[name]


def load_carryover_overrides(path=CARRYOVER_PATH):
    """season_carryover.csv: 前クールからの継続作品を手で含める／外す（列: season,title,include）。"""
    include, exclude = set(), set()
    if not os.path.exists(path):
        return include, exclude
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if (row.get("season") or "").strip() != SEASON:
                continue
            title = (row.get("title") or "").strip()
            flag = (row.get("include") or "").strip().lower()
            if title and flag in ("yes", "true", "1"):
                include.add(title)
            elif title and flag in ("no", "false", "0"):
                exclude.add(title)
    return include, exclude


def carryover_decision(node, season, include=frozenset(), exclude=frozenset()):
    """Annictの作品が今期の対象かを判定する。戻り値: (対象か, 理由, 最新の本放送日)"""
    work_season = None
    if node.get("seasonYear") and node.get("seasonName"):
        work_season = f"{node['seasonYear']}-{str(node['seasonName']).lower()}"
    programs = [p for p in ((node.get("programs") or {}).get("nodes") or []) if not p.get("rebroadcast")]
    latest = max((p["startedAt"][:10] for p in programs if p.get("startedAt")), default=None)
    title = node.get("title", "")
    if title in exclude:
        return False, "手動で除外（season_carryover.csv）", latest
    if work_season == season or work_season is None:
        return True, "今期の作品", latest
    if title in include:
        return True, "手動で追加（season_carryover.csv）", latest
    threshold = (season_start(season) + timedelta(days=CARRYOVER_MIN_DAYS_INTO_SEASON)).isoformat()
    if latest and latest >= threshold:
        return True, "前クールから放送継続", latest
    return False, "前クールで放送終了（または放送日が未登録）", latest

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

    # 今期に加えて前クールの作品も取り、前クールのものは「今期も放送が続いている作品」だけを残す
    q = """query($s:[String!],$a:String){searchWorks(seasons:$s,first:30,after:$a,orderBy:{field:WATCHERS_COUNT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{id title malAnimeId syobocalTid officialSiteUrl seasonName seasonYear
        programs(first:5,orderBy:{field:STARTED_AT,direction:DESC}){nodes{startedAt rebroadcast}}
        casts(first:40){nodes{name person{annictId name nameKana} character{name}}}}}}"""
    include, exclude = load_carryover_overrides()
    out, after, decisions = [], None, []
    while True:
        d = post("https://api.annict.com/graphql", {"query": q, "variables": {"s": [SEASON, previous_season(SEASON)], "a": after}},
                 {"Authorization": f"Bearer {token}"})["searchWorks"]
        for w in d["nodes"]:
            keep, reason, latest = carryover_decision(w, SEASON, include, exclude)
            decisions.append((w["title"], keep, reason, latest))
            if not keep:
                continue
            # [役名, 声優名, 読み, Annictの人物ID]。人物IDは声優IDの台帳（actor_registry.py）での照合に使う
            cast = [[(c["character"] or {}).get("name", ""), (c["person"] or {}).get("name") or c["name"],
                     (c["person"] or {}).get("nameKana") or "", (c["person"] or {}).get("annictId")] for c in w["casts"]["nodes"]]
            vods = fetch_work_vods(w["id"])
            thumbnail = fetch_official_thumbnail(w["officialSiteUrl"], w["title"])
            out.append({"annict_id": w["id"], "title": w["title"], "mal": w["malAnimeId"],
                        "tid": w["syobocalTid"], "official": w["officialSiteUrl"],
                        "vods": vods, "thumbnail": thumbnail, "thumbnail_source": "official_site",
                        "cast": [c for c in cast if c[1]]})
            time.sleep(1)
        if not d["pageInfo"]["hasNextPage"]:
            write_carryover_report(decisions)
            return out
        after = d["pageInfo"]["endCursor"]; time.sleep(1)


def write_carryover_report(decisions):
    """前クールの作品をどう判定したかを reports/ に残す（人が確認して season_carryover.csv で直せるように）。"""
    os.makedirs("reports", exist_ok=True)
    prev = [d for d in decisions if d[2] != "今期の作品"]
    lines = [f"# 前クールからの継続作品の判定（{SEASON}）", "",
             f"前クール（{previous_season(SEASON)}）の作品のうち、今期の対象にしたもの・外したものです。",
             "間違いは season_carryover.csv（列: season,title,include）で直せます。", "",
             "| 作品 | 判定 | 理由 | 最新の本放送日 |", "| --- | --- | --- | --- |"]
    lines += [f"| {t} | {'対象' if k else '対象外'} | {r} | {l or '-'} |" for t, k, r, l in sorted(prev, key=lambda d: (not d[1], d[0]))]
    with open(os.path.join("reports", f"carryover-{SEASON}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

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
    ap = argparse.ArgumentParser(); ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--season", default=SEASON, help="例: 2027-winter"); a = ap.parse_args()
    set_season(a.season)
    fetchers = {"annict": fetch_annict, "anilist": fetch_anilist, "syoboi": fetch_syoboi}
    src = {k: cached(f"{k}-{SEASON}" if k != "syoboi" else k, f, a.refresh) for k, f in fetchers.items()}
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
