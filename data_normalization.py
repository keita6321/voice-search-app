import csv
import re
import unicodedata
from pathlib import Path


_TITLE_ALIASES_PATH = Path(__file__).with_name("title_aliases.csv")
_ACTOR_NAME_RE = re.compile(
    r"[A-Za-zÀ-ɏ0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
    r"\U00020000-\U0002FA1F々〻ゝゞ・･.'’\-ー]+"
)


def title_key(title):
    normalized = unicodedata.normalize("NFKC", title).lower()
    return re.sub(r"[\W_]+", "", normalized)


def load_title_aliases(path=_TITLE_ALIASES_PATH):
    aliases = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            canonical = row["canonical_title"].strip()
            alias = row["alias_title"].strip()
            if not canonical or not alias:
                continue
            for title in (canonical, alias):
                key = title_key(title)
                existing = aliases.get(key)
                if existing and existing != canonical:
                    raise ValueError(f"Conflicting title aliases for {title!r}")
                aliases[key] = canonical
    return aliases


def canonical_title(title, aliases):
    return aliases.get(title_key(title), title)


def is_supported_actor_name(name):
    normalized = unicodedata.normalize("NFKC", name).strip()
    return bool(_ACTOR_NAME_RE.fullmatch(normalized)) and bool(
        re.search(r"[A-Za-zÀ-ɏ\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
                  r"\U00020000-\U0002FA1F]", normalized)
    )


def merge_work_variants(works, aliases):
    merged = {}
    for work in works:
        title = canonical_title(work["title"], aliases)
        key = title_key(title)
        if key not in merged:
            merged[key] = {**work, "title": title, "cast": [], "vods": []}
        target = merged[key]
        for cast in work.get("cast", []):
            if cast not in target["cast"]:
                target["cast"].append(cast)
        for provider in work.get("vods", []):
            if provider not in target["vods"]:
                target["vods"].append(provider)
        if not target.get("official_url"):
            target["official_url"] = work.get("official_url")
    return list(merged.values())
