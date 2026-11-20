"""声優ページの X 用画像（OGP、1200×630）を作る。

data.json（今期）と data-next.json（来期）から、声優ごとに
「名前・今期の出演作品数・出演作（役名）」を入れた画像を og/va/<ページID>.jpg に書き出す。
同じ内容なら同じ画像になるので、変わった声優の分だけ Git の差分が出る。

日本語フォント（Noto Sans CJK）が見つからないときは何もせずに終わる（ページは共通の画像のまま）。
GitHub Actions では fonts-noto-cjk を入れてから動かす。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "og" / "va"
W, H = 1200, 630
NAVY = (29, 42, 68)
PURPLE = (98, 81, 127)
YELLOW = (245, 197, 66)
WHITE = (255, 255, 255)
SUB = (200, 205, 220)
SEASON_JA = {"winter": "冬", "spring": "春", "summer": "夏", "autumn": "秋"}
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]
# ttc の中の日本語（JP）フォントの番号
JP_INDEX = 0


def find_font() -> str | None:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    return None


def season_label(season: str) -> str:
    year, name = season.split("-")
    return f"{year}年{SEASON_JA.get(name, '')}アニメ"


def page_id(actor_id: str) -> str:
    return actor_id[2:] if actor_id.startswith("va") else actor_id


def fit(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> str:
    """幅に収まらないときは末尾を「…」にする。"""
    if draw.textlength(text, font=font) <= width:
        return text
    while text and draw.textlength(text + "…", font=font) > width:
        text = text[:-1]
    return text + "…"


def jp_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    # Noto Sans CJK の ttc は JP / KR / SC / TC / HK の順。名前に JP を含むものを選ぶ
    for index in range(10):
        try:
            font = ImageFont.truetype(path, size, index=index)
        except OSError:
            break
        if "JP" in " ".join(font.getname()):
            return font
    return ImageFont.truetype(path, size, index=JP_INDEX)


def roles_by_work(actor: dict, works: dict, need_vod: bool) -> list[tuple[str, str]]:
    """作品ごとの役名。今期は声優ページと同じく、配信先がわかっている作品だけを数える。"""
    seen: dict[str, list[str]] = {}
    for role in actor.get("roles", []):
        work = works.get(role["work_id"], {})
        if need_vod and not work.get("vod_links"):
            continue
        title = work.get("title")
        if not title:
            continue
        seen.setdefault(title, [])
        if role.get("character_name") and role["character_name"] not in seen[title]:
            seen[title].append(role["character_name"])
    return [(title, "／".join(chars)) for title, chars in seen.items()]


def render(name: str, kicker: str, count_label: str, items: list[tuple[str, str]], rest: int, fonts: dict) -> Image.Image:
    image = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(image)
    # 左の色帯
    draw.rectangle([0, 0, 14, H], fill=YELLOW)
    # サイト名
    draw.text((64, 44), "ANIME CAST NOW", font=fonts["brand"], fill=WHITE)
    tw = draw.textlength("ANIME CAST NOW", font=fonts["brand"])
    draw.rounded_rectangle([64 + tw + 16, 46, 64 + tw + 16 + draw.textlength(kicker, font=fonts["kicker"]) + 28, 86], radius=20, fill=PURPLE)
    draw.text((64 + tw + 30, 50), kicker, font=fonts["kicker"], fill=WHITE)
    # 名前
    draw.text((64, 104), fit(draw, name, fonts["name"], W - 128), font=fonts["name"], fill=WHITE)
    # 出演作品数
    draw.text((64, 222), count_label, font=fonts["count"], fill=YELLOW)
    # 出演作（最大4件）
    y = 300
    for title, chars in items:
        line = f"{title}（{chars}）" if chars else title
        draw.rounded_rectangle([64, y, W - 64, y + 56], radius=14, fill=(41, 56, 88))
        draw.text((88, y + 9), fit(draw, line, fonts["item"], W - 176), font=fonts["item"], fill=WHITE)
        y += 66
    if rest > 0:
        draw.text((64, H - 56), f"ほか{rest}作品", font=fonts["foot"], fill=YELLOW)
    # 下の案内
    foot = "出演作と配信先は animecastnow.com"
    draw.text((W - 64 - draw.textlength(foot, font=fonts["foot"]), H - 56), foot, font=fonts["foot"], fill=SUB)
    return image


def main() -> int:
    font_path = find_font()
    if not font_path:
        print("日本語フォントが見つからないため、声優ごとの X 用画像は作りませんでした。", file=sys.stderr)
        return 0
    fonts = {
        "brand": jp_font(font_path, 34),
        "kicker": jp_font(font_path, 24),
        "name": jp_font(font_path, 92),
        "count": jp_font(font_path, 48),
        "item": jp_font(font_path, 30),
        "foot": jp_font(font_path, 26),
    }
    current = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    next_path = ROOT / "data-next.json"
    upcoming = json.loads(next_path.read_text(encoding="utf-8")) if next_path.exists() else None
    next_by_id = {a["actor_id"]: a for a in (upcoming or {}).get("voice_actors", [])}

    OUT.mkdir(parents=True, exist_ok=True)
    wanted: set[str] = set()
    actors = {a["actor_id"]: a for a in current["voice_actors"]}
    for actor_id, actor in actors.items():
        items = roles_by_work(actor, current["works"], True)
        if items:
            kicker = season_label(current["season"])
            count_label = f"今期 {len(items)}作品に出演中"
        elif actor_id in next_by_id and upcoming:
            actor = next_by_id[actor_id]
            items = roles_by_work(actor, upcoming["works"], False)
            kicker = season_label(upcoming["season"])
            count_label = f"来期 {len(items)}作品に出演予定"
        else:
            continue
        if not items:
            continue
        pid = page_id(actor_id)
        wanted.add(f"{pid}.jpg")
        image = render(actor["name"], kicker, count_label, items[:3], len(items) - 3, fonts)
        out = OUT / f"{pid}.jpg"
        # 同じ画像なら書き直さない（Git の差分を出さない）
        tmp = OUT / f".{pid}.tmp.jpg"
        image.save(tmp, "JPEG", quality=74, optimize=True, progressive=True)
        if out.exists() and out.read_bytes() == tmp.read_bytes():
            tmp.unlink()
        else:
            tmp.replace(out)
    # 声優がいなくなった画像は消す
    for old in OUT.glob("*.jpg"):
        if old.name not in wanted:
            old.unlink()
    print(f"X 用画像：{len(wanted)}人分")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
