"""GA4 と Search Console の数字を取ってきて、日ごとのレポートを作る。

GitHub Actions（.github/workflows/analytics.yml）から毎朝動かす。
認証は GitHub のシークレット GA_SA_KEY（サービスアカウントの JSON。読み取り専用）。
出力：
  out/latest.md        … 人が読むまとめ（直近7日と、その前の7日の比較）
  out/YYYY-MM-DD.json  … 取ってきた数字そのもの
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from google.oauth2 import service_account
from google.auth.transport.requests import Request

GA_PROPERTY = "563996028"
SC_SITE = "https://animecastnow.com/"
SCOPES = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
]
JST = timezone(timedelta(hours=9))


def token() -> str:
    info = json.loads(os.environ["GA_SA_KEY"])
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    creds.refresh(Request())
    return creds.token


def post(url: str, body: dict, tok: str) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
        "Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{url} → HTTP {error.code}: {error.read()[:500]!r}")


def ga(tok: str, dims: list[str], mets: list[str], start: str, end: str, limit: int = 50, order: str | None = None, flt: dict | None = None) -> list[dict]:
    body = {
        "dateRanges": [{"startDate": start, "endDate": end}],
        "dimensions": [{"name": d} for d in dims],
        "metrics": [{"name": m} for m in mets],
        "limit": limit,
    }
    if order:
        body["orderBys"] = [{"metric": {"metricName": order}, "desc": True}]
    if flt:
        body["dimensionFilter"] = flt
    res = post(f"https://analyticsdata.googleapis.com/v1beta/properties/{GA_PROPERTY}:runReport", body, tok)
    rows = []
    for row in res.get("rows", []):
        item = {d: v["value"] for d, v in zip(dims, row.get("dimensionValues", []))}
        for m, v in zip(mets, row.get("metricValues", [])):
            item[m] = float(v["value"])
        rows.append(item)
    return rows


def sc(tok: str, dims: list[str], start: str, end: str, limit: int = 50) -> list[dict]:
    url = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(SC_SITE, safe='')}/searchAnalytics/query"
    res = post(url, {"startDate": start, "endDate": end, "dimensions": dims, "rowLimit": 1000 if dims != ["date"] else limit}, tok)
    rows = [{**dict(zip(dims, r["keys"])), "clicks": r["clicks"], "impressions": r["impressions"], "ctr": r["ctr"], "position": r["position"]} for r in res.get("rows", [])]
    # 日別は日付順、それ以外はクリック・表示の多い順
    return rows if dims == ["date"] else sorted(rows, key=lambda r: (-r["clicks"], -r["impressions"]))


def total(rows: list[dict], key: str) -> float:
    return sum(r.get(key, 0) for r in rows)


def delta(now: float, prev: float) -> str:
    if prev == 0:
        return "（前週 0）" if now else ""
    pct = (now - prev) / prev * 100
    return f"（前週比 {pct:+.0f}%）"


def table(rows: list[dict], cols: list[tuple[str, str]], n: int = 15) -> str:
    if not rows:
        return "（データなし）\n"
    head = "| " + " | ".join(label for _, label in cols) + " |\n|" + "---|" * len(cols) + "\n"
    body = ""
    for r in rows[:n]:
        cells = []
        for key, _ in cols:
            v = r.get(key, "")
            if isinstance(v, float):
                v = f"{v:.1%}" if key in ("engagementRate", "ctr") else (f"{v:.1f}" if key == "position" else f"{v:.0f}")
            cells.append(str(v).replace("|", "｜"))
        body += "| " + " | ".join(cells) + " |\n"
    return head + body


def main() -> int:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "out")
    out.mkdir(parents=True, exist_ok=True)
    tok = token()
    today = datetime.now(JST).date()
    end = today - timedelta(days=1)            # 昨日まで
    start7 = end - timedelta(days=6)
    pend = start7 - timedelta(days=1)
    pstart = pend - timedelta(days=6)
    start28 = end - timedelta(days=27)
    sc_end = today - timedelta(days=3)         # Search Console は2〜3日遅れ
    sc_start = sc_end - timedelta(days=27)
    f = lambda d: d.isoformat()

    base = ["sessions", "activeUsers", "newUsers", "screenPageViews", "engagedSessions", "userEngagementDuration"]
    data = {
        "generated_at": datetime.now(JST).isoformat(timespec="minutes"),
        "range": {"last7": [f(start7), f(end)], "prev7": [f(pstart), f(pend)], "last28": [f(start28), f(end)], "search": [f(sc_start), f(sc_end)]},
        "daily": ga(tok, ["date"], base, f(start28), f(end), 40),
        "channel_last7": ga(tok, ["sessionSourceMedium"], ["sessions", "engagedSessions", "userEngagementDuration"], f(start7), f(end), 20, "sessions"),
        "channel_prev7": ga(tok, ["sessionSourceMedium"], ["sessions"], f(pstart), f(pend), 20, "sessions"),
        "landing_last7": ga(tok, ["landingPage"], ["sessions", "engagementRate", "userEngagementDuration"], f(start7), f(end), 30, "sessions"),
        "pages_last7": ga(tok, ["pagePath"], ["screenPageViews", "activeUsers", "userEngagementDuration"], f(start7), f(end), 30, "screenPageViews"),
        "events_last7": ga(tok, ["eventName"], ["eventCount", "totalUsers"], f(start7), f(end), 50, "eventCount"),
        "events_prev7": ga(tok, ["eventName"], ["eventCount"], f(pstart), f(pend), 50, "eventCount"),
        "quote_posts_last28": ga(tok, ["sessionManualAdContent", "landingPage"], ["sessions", "engagedSessions"], f(start28), f(end), 50, "sessions",
                                 {"filter": {"fieldName": "sessionCampaignName", "stringFilter": {"value": "quote"}}}),
        # 直接（direct）で来た人の内訳：誰が来ているのかを見るため
        "direct_detail_last7": ga(tok, ["date", "deviceCategory", "browser", "city", "landingPage"], ["sessions", "engagedSessions", "userEngagementDuration", "newUsers"], f(start7), f(end), 100, "sessions",
                                  {"filter": {"fieldName": "sessionDefaultChannelGroup", "stringFilter": {"value": "Direct"}}}),
        "device_last7": ga(tok, ["sessionDefaultChannelGroup", "deviceCategory", "operatingSystem"], ["sessions", "userEngagementDuration"], f(start7), f(end), 30, "sessions"),
        "search_queries": sc(tok, ["query"], f(sc_start), f(sc_end), 50),
        "search_pages": sc(tok, ["page"], f(sc_start), f(sc_end), 30),
        "search_daily": sc(tok, ["date"], f(sc_start), f(sc_end), 40),
    }
    (out / f"{f(end)}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    last = {k: sum(float(r[k]) for r in data["daily"] if f(start7).replace("-", "") <= r["date"] <= f(end).replace("-", "")) for k in base}
    prev_rows = ga(tok, ["date"], base, f(pstart), f(pend), 10)
    prev = {k: total(prev_rows, k) for k in base}
    ev_prev = {r["eventName"]: r["eventCount"] for r in data["events_prev7"]}
    for r in data["events_last7"]:
        r["prev"] = ev_prev.get(r["eventName"], 0.0)
    for r in data["landing_last7"]:
        r["avgSec"] = r["userEngagementDuration"] / r["sessions"] if r["sessions"] else 0.0
    sc_clicks = total(data["search_daily"], "clicks")
    sc_impr = total(data["search_daily"], "impressions")

    md = f"""# アクセスのまとめ（{f(start7)}〜{f(end)}）

作成：{data['generated_at']}（GA4 は昨日まで、Search Console は {f(sc_start)}〜{f(sc_end)}）

## 全体（直近7日）
- セッション {last['sessions']:.0f}{delta(last['sessions'], prev['sessions'])}
- ユーザー {last['activeUsers']:.0f}{delta(last['activeUsers'], prev['activeUsers'])}／うち新規 {last['newUsers']:.0f}
- ページの表示 {last['screenPageViews']:.0f}{delta(last['screenPageViews'], prev['screenPageViews'])}
- エンゲージのあったセッション {last['engagedSessions']:.0f}{delta(last['engagedSessions'], prev['engagedSessions'])}
- 1セッションあたりの滞在 {(last['userEngagementDuration'] / last['sessions'] if last['sessions'] else 0):.0f}秒

## 流入元（直近7日）
{table(data['channel_last7'], [('sessionSourceMedium', '参照元/メディア'), ('sessions', 'セッション'), ('engagedSessions', 'エンゲージ')])}
## 最初に開いたページ（直近7日）
{table(data['landing_last7'], [('landingPage', 'ページ'), ('sessions', 'セッション'), ('engagementRate', 'エンゲージ率'), ('avgSec', '平均滞在(秒)')])}
## イベント（直近7日／前の7日）
{table(data['events_last7'], [('eventName', 'イベント'), ('eventCount', '回数'), ('prev', '前の7日'), ('totalUsers', '人数')], 30)}
## 引用ポストから（直近28日、utm_campaign=quote）
{table(data['quote_posts_last28'], [('sessionManualAdContent', 'utm_content'), ('landingPage', '着地'), ('sessions', 'セッション'), ('engagedSessions', 'エンゲージ')], 30)}
## 直接（Direct）で来た人の内訳（直近7日）
{table(data['direct_detail_last7'], [('date', '日'), ('deviceCategory', '端末'), ('browser', 'ブラウザ'), ('city', '地域'), ('landingPage', '着地'), ('sessions', 'セッション'), ('userEngagementDuration', '滞在合計(秒)')], 40)}
## 流入元×端末（直近7日）
{table(data['device_last7'], [('sessionDefaultChannelGroup', '流入元'), ('deviceCategory', '端末'), ('operatingSystem', 'OS'), ('sessions', 'セッション'), ('userEngagementDuration', '滞在合計(秒)')], 20)}
## Google 検索（{f(sc_start)}〜{f(sc_end)}）
- クリック {sc_clicks:.0f}／表示 {sc_impr:.0f}

### 検索された言葉
{table(data['search_queries'], [('query', '言葉'), ('clicks', 'クリック'), ('impressions', '表示'), ('position', '平均順位')], 30)}
### ページ
{table(data['search_pages'], [('page', 'ページ'), ('clicks', 'クリック'), ('impressions', '表示'), ('position', '平均順位')], 20)}"""
    (out / "latest.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
