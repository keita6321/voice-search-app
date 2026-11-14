#!/usr/bin/env python3
"""Discover VOD links from official anime sites and configured lineups.

--auto: 週1回の自動更新用。各作品の公式サイト（トップと、配信・放送情報らしいページを最大2つ）だけを見て、
配信サービスの作品ページへのリンクがあれば vod_overrides.csv に追加する（VODサイト自体はクロールしない）。
"""
import argparse
import csv
import difflib
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from data_normalization import canonical_title, load_title_aliases, title_key


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data.json"
LINEUP_SOURCES_PATH = ROOT / "vod_lineup_sources.csv"
CANDIDATES_PATH = ROOT / "vod_candidates.csv"
OVERRIDES_PATH = ROOT / "vod_overrides.csv"
USER_AGENT = "voice-search-app-vod-discovery/1.0"
PROVIDER_HOSTS = {
    "ABEMA": ("abema.tv",),
    "U-NEXT": ("video.unext.jp",),
    "Disney+": ("disneyplus.com",),
    "Amazon Prime Video": ("amazon.co.jp", "primevideo.com"),
    "dアニメストア": ("animestore.docomo.ne.jp",),
    "DMM TV": ("tv.dmm.com",),
    "Hulu": ("hulu.jp",),
    "Netflix": ("netflix.com",),
}
CANDIDATE_FIELDS = [
    "title", "provider", "method", "match_type", "matched_title", "confidence",
    "source_url", "evidence_url", "decision", "checked_at",
]
TRACKING_KEYS = {"fbclid", "gclid", "yclid", "ref", "referrer", "affiliate", "campaign"}
GENERIC_LINK_TEXT = {
    "abema", "u-next", "unext", "視聴", "視聴はこちら", "配信ページ",
    "作品ページ", "詳細はこちら", "公式サイト", "abemaで視聴", "u-nextで視聴",
    "abemaで見る", "u-nextで見る",
}


def clean_url(url):
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username
        or parts.password
        or port not in (None, 443)
    ):
        return None
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in TRACKING_KEYS
    ]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def provider_for_url(url):
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    path = parts.path.lower()
    if any(host == domain or host.endswith("." + domain) for domain in PROVIDER_HOSTS["ABEMA"]):
        return "ABEMA" if path.startswith("/video/title/") else None
    if host == "video.unext.jp" and path.startswith("/title/"):
        return "U-NEXT"
    if any(host == domain or host.endswith("." + domain) for domain in PROVIDER_HOSTS["Disney+"]):
        return "Disney+" if re.search(r"/(series|movies|browse)/", path) else None
    query = parts.query.lower()
    # Amazonは配信ページ（/gp/video/）だけ。/dp/ はBlu-rayなどの商品ページのことが多いので拾わない
    # 作品ページ（/gp/video/detail/）だけ。トップ・特集・有料チャンネル（/gp/video/storefront・channel など）は作品の配信の根拠にならない
    if host in ("amazon.co.jp", "www.amazon.co.jp") and path.startswith("/gp/video/detail/"):
        return "Amazon Prime Video"
    if host.endswith("primevideo.com") and "/detail/" in path:
        return "Amazon Prime Video"
    if host == "animestore.docomo.ne.jp" and "workid=" in query:
        return "dアニメストア"
    if host == "tv.dmm.com" and path.startswith("/vod/") and "season=" in query:
        return "DMM TV"
    if host in ("hulu.jp", "www.hulu.jp") and re.fullmatch(r"/(watch/)?[\w-]{4,}/?", path) and path.strip("/") not in HULU_NON_TITLES:
        return "Hulu"
    if host in ("netflix.com", "www.netflix.com") and re.search(r"/title/\d+", path):
        return "Netflix"
    return None


HULU_NON_TITLES = {"login", "signup", "help", "search", "store", "account", "static", "tvshows", "movies", "features", "watch"}


class OfficialPageFetcher:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})
        self.robots = {}
        self.last_request = {}

    def _robots_for(self, url):
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            parser = RobotFileParser()
            robots_url = urljoin(origin, "/robots.txt")
            for _ in range(6):
                response = self.session.get(robots_url, timeout=(5, 15), allow_redirects=False)
                if response.is_redirect or response.is_permanent_redirect:
                    location = response.headers.get("Location")
                    redirected_url = urljoin(robots_url, location or "")
                    if urlsplit(redirected_url).hostname != parts.hostname or not location:
                        raise ValueError(f"Cross-host robots.txt redirect refused: {robots_url}")
                    robots_url = redirected_url
                    continue
                if response.status_code in (404, 410):
                    parser.parse([])
                elif response.status_code == 200:
                    parser.parse(response.text.splitlines())
                else:
                    raise requests.HTTPError(
                        f"robots.txt returned HTTP {response.status_code}: {robots_url}",
                        response=response,
                    )
                break
            else:
                raise ValueError(f"Too many robots.txt redirects: {origin}")
            self.robots[origin] = parser
        return self.robots[origin]

    def get(self, url):
        current_url = url
        original_host = urlsplit(url).hostname
        for _ in range(6):
            parts = urlsplit(current_url)
            if parts.scheme not in ("http", "https") or not parts.hostname or parts.username or parts.password:
                raise ValueError(f"Unsupported URL: {current_url}")
            if parts.hostname != original_host:
                raise ValueError(f"Cross-host redirect refused: {current_url}")
            self._wait_for_request(current_url)
            response = self.session.get(current_url, timeout=(5, 15), allow_redirects=False)
            self.last_request[f"{parts.scheme}://{parts.netloc}"] = time.monotonic()

            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("Location")
                if not location:
                    response.raise_for_status()
                current_url = urljoin(current_url, location)
                continue
            response.raise_for_status()
            response.encoding = response.apparent_encoding
            return response.text, current_url
        raise ValueError(f"Too many redirects: {url}")

    def _wait_for_request(self, url):
        parts = urlsplit(url)
        robots = self._robots_for(url)
        if not robots.can_fetch(USER_AGENT, url):
            raise PermissionError(f"Blocked by robots.txt: {url}")
        origin = f"{parts.scheme}://{parts.netloc}"
        delay = max(1.0, robots.crawl_delay(USER_AGENT) or 0)
        remaining = delay - (time.monotonic() - self.last_request.get(origin, 0))
        if remaining > 0:
            time.sleep(remaining)

    def get_rendered(self, url, provider):
        html, final_url = self.get(url)
        if provider_links(html, final_url):
            return html, final_url

        try:
            from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise RuntimeError(
                "JavaScript-rendered lineups require Playwright; install requirements.txt "
                "and run `python -m playwright install chromium`"
            ) from exc

        self._wait_for_request(final_url)
        selector = 'a[href*="/video/title/"]' if provider == "ABEMA" else 'a[href*="/title/"]'
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(locale="ja-JP")
                page.goto(final_url, wait_until="domcontentloaded", timeout=30000)
                parts = urlsplit(final_url)
                self.last_request[f"{parts.scheme}://{parts.netloc}"] = time.monotonic()
                try:
                    page.wait_for_function(
                        "selector => document.querySelector(selector) !== null",
                        arg=selector,
                        timeout=20000,
                    )
                except PlaywrightTimeoutError as exc:
                    raise RuntimeError(f"No rendered {provider} title links found at {final_url}") from exc
                rendered_url = page.url
                if urlsplit(rendered_url).hostname != urlsplit(final_url).hostname:
                    raise ValueError(f"Cross-host browser redirect refused: {rendered_url}")
                return page.content(), rendered_url
            finally:
                browser.close()


def anchor_title(anchor):
    title_element = anchor.select_one("h1, h2, h3, h4, h5, h6, [class*='__title']")
    if title_element:
        value = re.sub(r"\s+", " ", title_element.get_text(" ", strip=True)).strip()
        if value and value.casefold() not in GENERIC_LINK_TEXT:
            return value
    for value in (anchor.get_text(" ", strip=True), anchor.get("aria-label"), anchor.get("title")):
        if value and value.strip().casefold() not in GENERIC_LINK_TEXT:
            return re.sub(r"\s+", " ", value).strip()
    image = anchor.find("img", alt=True)
    if image:
        value = re.sub(r"\s+", " ", image["alt"]).strip()
        if value.casefold() not in GENERIC_LINK_TEXT:
            return value
    return ""


def provider_links(html, page_url):
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for anchor in soup.select("a[href]"):
        target = clean_url(urljoin(page_url, anchor["href"]))
        if not target:
            continue
        provider = provider_for_url(target)
        if provider:
            links.append((provider, target, anchor_title(anchor)))
    return links


def title_match(candidate_title, works, aliases):
    candidate_key = title_key(canonical_title(candidate_title, aliases))
    exact = next((work for work in works if title_key(work["title"]) == candidate_key), None)
    if exact:
        return exact, "exact", 1.0

    best_work = None
    best_score = 0.0
    for work in works:
        score = difflib.SequenceMatcher(None, candidate_key, title_key(work["title"])).ratio()
        if score > best_score:
            best_work, best_score = work, score
    if best_work and best_score >= 0.72:
        return best_work, "fuzzy", best_score
    return None, "unmatched", best_score


def discover_official_site_candidates(works, fetcher):
    rows, errors = [], []
    for work in works:
        official_url = work.get("official_url")
        if not official_url:
            continue
        try:
            html, final_url = fetcher.get(official_url)
        except (requests.RequestException, PermissionError, ValueError) as exc:
            errors.append((work["title"], str(exc)))
            continue

        for provider, source_url, _ in provider_links(html, final_url):
            rows.append({
                "title": work["title"],
                "provider": provider,
                "method": "official_site",
                "match_type": "direct",
                "matched_title": work["title"],
                "confidence": "1.000",
                "source_url": source_url,
                "evidence_url": final_url,
                "decision": "",
                "checked_at": "",
            })
    return rows, errors


def load_lineup_sources(season):
    if not LINEUP_SOURCES_PATH.exists():
        return []
    with LINEUP_SOURCES_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"provider", "season", "url"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"{LINEUP_SOURCES_PATH} must have columns: {', '.join(sorted(required))}")
        sources = []
        for line, row in enumerate(reader, 2):
            if not any((row.get("provider"), row.get("season"), row.get("url"))):
                continue
            provider = (row.get("provider") or "").strip()
            source_season = (row.get("season") or "").strip()
            url = (row.get("url") or "").strip()
            if provider not in PROVIDER_HOSTS:
                raise ValueError(f"{LINEUP_SOURCES_PATH}:{line} has unsupported provider {provider!r}")
            if source_season != season:
                continue
            if not url.startswith("https://"):
                raise ValueError(f"{LINEUP_SOURCES_PATH}:{line} url must be HTTPS")
            sources.append((provider, url))
        return sources


def discover_lineup_candidates(works, sources, fetcher, aliases):
    rows, errors = [], []
    for expected_provider, evidence_url in sources:
        try:
            html, final_url = fetcher.get_rendered(evidence_url, expected_provider)
        except (requests.RequestException, PermissionError, RuntimeError, ValueError) as exc:
            errors.append((evidence_url, str(exc)))
            continue

        for provider, source_url, candidate_title in provider_links(html, final_url):
            if provider != expected_provider or not candidate_title:
                continue
            work, match_type, confidence = title_match(candidate_title, works, aliases)
            if not work:
                continue
            rows.append({
                "title": work["title"],
                "provider": provider,
                "method": "lineup",
                "match_type": match_type,
                "matched_title": candidate_title,
                "confidence": f"{confidence:.3f}",
                "source_url": source_url,
                "evidence_url": final_url,
                "decision": "",
                "checked_at": "",
            })
    return rows, errors


def write_candidates(rows):
    unique = {}
    for row in rows:
        key = (title_key(row["title"]), row["provider"], row["source_url"])
        unique[key] = row
    with CANDIDATES_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CANDIDATE_FIELDS)
        writer.writeheader()
        writer.writerows(unique.values())
    return list(unique.values())


def apply_approved_candidates():
    if not CANDIDATES_PATH.exists():
        raise FileNotFoundError(f"{CANDIDATES_PATH} not found; run discovery first")
    aliases = load_title_aliases()
    with CANDIDATES_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = set(CANDIDATE_FIELDS)
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"{CANDIDATES_PATH} must have columns: {', '.join(sorted(required))}")
        candidates = list(reader)

    if not OVERRIDES_PATH.exists():
        raise FileNotFoundError(f"{OVERRIDES_PATH} not found")
    with OVERRIDES_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required_overrides = {"title", "provider", "source_url", "checked_at"}
        if not required_overrides.issubset(reader.fieldnames or []):
            raise ValueError(f"{OVERRIDES_PATH} must have columns: {', '.join(sorted(required_overrides))}")
        existing = list(reader)

    known = {}
    for row in existing:
        key = (title_key(canonical_title(row["title"], aliases)), row["provider"])
        known[key] = row["source_url"]

    approved, rejected = [], []
    for line, row in enumerate(candidates, 2):
        decision = (row.get("decision") or "").strip().lower()
        if decision == "reject":
            rejected.append(line)
            continue
        if decision != "approve":
            continue
        title = (row.get("title") or "").strip()
        provider = (row.get("provider") or "").strip()
        source_url = clean_url((row.get("source_url") or "").strip())
        if not title or provider not in PROVIDER_HOSTS or not source_url or provider_for_url(source_url) != provider:
            raise ValueError(f"{CANDIDATES_PATH}:{line} has an invalid approved candidate")
        key = (title_key(canonical_title(title, aliases)), provider)
        if key in known:
            if known[key] != source_url:
                raise ValueError(f"{CANDIDATES_PATH}:{line} conflicts with an existing {provider} override for {title!r}")
            continue
        checked_at = (row.get("checked_at") or "").strip() or date.today().isoformat()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", checked_at):
            raise ValueError(f"{CANDIDATES_PATH}:{line} checked_at must use YYYY-MM-DD")
        try:
            date.fromisoformat(checked_at)
        except ValueError as exc:
            raise ValueError(f"{CANDIDATES_PATH}:{line} has invalid checked_at {checked_at!r}") from exc
        approved.append({
            "title": title,
            "provider": provider,
            "source_url": source_url,
            "checked_at": checked_at,
        })
        known[key] = source_url

    if approved:
        with OVERRIDES_PATH.open("a", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["title", "provider", "source_url", "checked_at"])
            writer.writerows(approved)
    print(f"追加 {len(approved)}件 / 既存と同一のためスキップ {sum(1 for r in candidates if (r.get('decision') or '').strip().lower() == 'approve') - len(approved)}件 / 却下 {len(rejected)}件")


# 公式サイトで、配信・放送情報が載っていそうなページ
INFO_PAGE_PATTERN = re.compile(r"onair|on-air|on_air|broadcast|stream|haishin|vod|配信|放送", re.I)
MAX_INFO_PAGES = 2


def info_pages(html, page_url):
    """公式サイトのトップから、同じホストの「配信・放送情報」らしいページを探す。"""
    soup = BeautifulSoup(html, "html.parser")
    host = urlsplit(page_url).hostname
    found = []
    for anchor in soup.select("a[href]"):
        target = clean_url(urljoin(page_url, anchor["href"]))
        if not target or urlsplit(target).hostname != host or target.rstrip("/") == page_url.rstrip("/"):
            continue
        text = anchor.get_text(" ", strip=True)
        if INFO_PAGE_PATTERN.search(urlsplit(target).path) or INFO_PAGE_PATTERN.search(text):
            if target not in found:
                found.append(target)
        if len(found) >= MAX_INFO_PAGES:
            break
    return found


def scan_official_site(work, fetcher):
    """公式サイトのトップと配信情報ページから、配信サービスの作品ページへのリンクを集める。
    戻り値: {provider: (配信ページのURL, 見つけた公式ページのURL)}"""
    html, final_url = fetcher.get(work["official_url"])
    pages = [(html, final_url)]
    for url in info_pages(html, final_url):
        try:
            pages.append(fetcher.get(url))
        except (requests.RequestException, PermissionError, ValueError):
            continue
    found = {}
    # 作品ごとのページ（/season3/ など）がある場合、その下のページのリンクだけを使う（シリーズ全体のページの配信リンクは別の作品のものかもしれない）
    _, base = _site_path(work["official_url"])
    if base != "/":
        pages = [(h, u) for h, u in pages if _site_path(u)[1].startswith(base)]
    for page_html, page_url in pages:
        for provider, link, _ in provider_links(page_html, page_url):
            found.setdefault(provider, (link, page_url))
    return found


def load_override_keys(aliases):
    if not OVERRIDES_PATH.exists():
        return set()
    with OVERRIDES_PATH.open(encoding="utf-8-sig", newline="") as f:
        return {(title_key(canonical_title(row["title"], aliases)), row["provider"]) for row in csv.DictReader(f) if row.get("title")}


# 公式ではない出典（配信情報のまとめサイトなど）。公式サイトで同じ配信先が見つかったら、出典を公式のリンクに差し替える
UNOFFICIAL_SOURCE_HOSTS = {"animedia-khaki.vercel.app"}
OVERRIDE_FIELDS = ["title", "provider", "source_url", "checked_at"]


def _site_path(url):
    parts = urlsplit(url or "")
    path = parts.path
    if path.endswith(("index.html", "index.php")):
        path = path.rsplit("/", 1)[0] + "/"
    return (parts.hostname or "").lower().removeprefix("www."), path.rstrip("/") + "/"


def shares_site(work, data):
    """劇場版やミニアニメなど、別の作品と同じ公式サイト（同じ場所）を使っている作品か。
    その場合、公式サイトの配信リンクがどの作品のものか決められないので、自動では追加しない。
    （同じホストでも /season3/ のように作品ごとのページがあれば対象にする）"""
    host, path = _site_path(work["official_url"])
    for other in data["works"].values():
        if other is work or not other.get("official_url"):
            continue
        other_host, other_path = _site_path(other["official_url"])
        # 同じ場所、またはこの作品のページの下に別の作品のページがある（シリーズ全体のサイト）
        if other_host == host and other_path.startswith(path):
            return True
    return False


def is_unofficial(url):
    return (urlsplit(url or "").hostname or "") in UNOFFICIAL_SOURCE_HOSTS


def auto_discover(data, fetcher, aliases, today=None, report_dir=ROOT / "reports"):
    """公式サイトにリンクがある配信サービスのうち、まだ載っていないものを vod_overrides.csv に追加する。
    すでにある行でも、出典が公式ではないもの（まとめサイトなど）は、公式サイトで見つかれば出典を差し替える。"""
    today = today or date.today().isoformat()
    rows = []
    if OVERRIDES_PATH.exists():
        with OVERRIDES_PATH.open(encoding="utf-8-sig", newline="") as f:
            rows = [row for row in csv.DictReader(f) if row.get("title")]
    by_key = {(title_key(canonical_title(row["title"], aliases)), row["provider"]): row for row in rows}
    added, verified, errors, shared, scanned = [], [], [], [], 0
    for work in data["works"].values():
        if not work.get("official_url"):
            continue
        if shares_site(work, data):
            shared.append(work["title"])
            continue
        have = {link["provider"] for link in work.get("vod_links", [])}
        key = title_key(canonical_title(work["title"], aliases))
        try:
            found = scan_official_site(work, fetcher)
        except (requests.RequestException, PermissionError, ValueError) as exc:
            errors.append((work["title"], str(exc)[:120]))
            continue
        scanned += 1
        for provider, (link, evidence) in found.items():
            row = by_key.get((key, provider))
            if row is not None:
                if is_unofficial(row.get("source_url")):
                    row["source_url"], row["checked_at"] = link, today
                    verified.append({"title": row["title"], "provider": provider, "source_url": link, "evidence": evidence})
                continue
            if provider in have:
                continue
            row = {"title": work["title"], "provider": provider, "source_url": link, "checked_at": today}
            rows.append(row)
            by_key[(key, provider)] = row
            added.append({**row, "evidence": evidence})
    if added or verified:
        with OVERRIDES_PATH.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=OVERRIDE_FIELDS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    unverified = [row for row in rows if is_unofficial(row.get("source_url"))]
    report_dir.mkdir(exist_ok=True)
    lines = [f"# 公式サイトから見つけた配信先（{data['season']}、{today}）", "",
             f"公式サイトを確認した作品：{scanned}作品／取得できなかった作品：{len(errors)}作品／追加：{len(added)}件／公式で裏付けが取れた既存の行：{len(verified)}件", "",
             f"まとめサイトが出典のまま、公式でまだ裏付けが取れていない行：{len(unverified)}件（下に一覧）", "",
             "追加・差し替えした内容は vod_overrides.csv に入っています。間違いがあれば、その行を消してください。", "",
             "## 追加した配信先", "", "| 作品 | 配信サービス | 配信ページ | 見つけた公式ページ |", "| --- | --- | --- | --- |"]
    lines += [f"| {a['title']} | {a['provider']} | {a['source_url']} | {a['evidence']} |" for a in added]
    lines += ["", "## 公式で裏付けが取れた既存の行", "", "| 作品 | 配信サービス | 配信ページ | 見つけた公式ページ |", "| --- | --- | --- | --- |"]
    lines += [f"| {v['title']} | {v['provider']} | {v['source_url']} | {v['evidence']} |" for v in verified]
    lines += ["", "## まだ裏付けが取れていない行（出典がまとめサイト）", ""]
    lines += [f"- {row['title']} / {row['provider']}" for row in unverified]
    if shared:
        lines += ["", "## 公式サイトを別の作品と共有しているため見送った作品", ""] + [f"- {title}" for title in shared]
    if errors:
        lines += ["", "## 取得できなかった公式サイト", ""] + [f"- {title}: {error}" for title, error in errors]
    (report_dir / f"vod-discovery-{data['season']}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return added, errors, verified, unverified


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-approved", action="store_true", help="Import approved rows from vod_candidates.csv")
    parser.add_argument("--auto", action="store_true", help="公式サイトだけを見て、見つかった配信先を vod_overrides.csv に直接追加する（週1回の自動更新用）")
    args = parser.parse_args()
    if args.auto:
        with DATA_PATH.open(encoding="utf-8") as f:
            data = json.load(f)
        added, errors, verified, unverified = auto_discover(data, OfficialPageFetcher(), load_title_aliases())
        print(f"公式サイトから配信先を追加: {len(added)}件、公式で裏付け: {len(verified)}件、未確認のまま: {len(unverified)}件"
              f"（取得できなかった公式サイト {len(errors)}件）→ reports/vod-discovery-{data['season']}.md")
        for row in added:
            print(f"  + {row['title']} / {row['provider']}")
        return
    if args.apply_approved:
        apply_approved_candidates()
        return

    with DATA_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    works = [
        {"title": work["title"], "official_url": work.get("official_url")}
        for work in data["works"].values()
        if not work.get("vod_links")
    ]
    aliases = load_title_aliases()
    fetcher = OfficialPageFetcher()
    official_rows, official_errors = discover_official_site_candidates(works, fetcher)
    lineup_sources = load_lineup_sources(data["season"])
    lineup_rows, lineup_errors = discover_lineup_candidates(works, lineup_sources, fetcher, aliases)
    rows = write_candidates(official_rows + lineup_rows)

    print(f"公式サイト: {len(official_rows)}件 / ラインナップ: {len(lineup_rows)}件 → {CANDIDATES_PATH.name}")
    if not lineup_sources:
        print(f"ラインナップ未実行: {LINEUP_SOURCES_PATH.name} に {data['season']} のABEMA/U-NEXT公式URLを登録してください。", file=sys.stderr)
    for label, errors in (("公式サイト", official_errors), ("ラインナップ", lineup_errors)):
        for url, error in errors:
            print(f"[{label}取得失敗] {url}: {error}", file=sys.stderr)
    print(f"CSV出力候補: {len(rows)}件")


if __name__ == "__main__":
    main()
