import csv
import re
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit


_TITLE_ALIASES_PATH = Path(__file__).with_name("title_aliases.csv")
_VOD_OVERRIDES_PATH = Path(__file__).with_name("vod_overrides.csv")
_VOD_AUDIT_PATH = Path(__file__).with_name("vod_audit.csv")
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


def apply_vod_overrides(works, provider_urls, path=_VOD_OVERRIDES_PATH):
    aliases = load_title_aliases()
    works_by_title = {title_key(work["title"]): work for work in works}
    seen = set()

    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"title", "provider", "source_url", "checked_at"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"{path} must have columns: {', '.join(sorted(required))}")

        for line, row in enumerate(reader, 2):
            title = (row.get("title") or "").strip()
            provider = (row.get("provider") or "").strip()
            source_url = (row.get("source_url") or "").strip()
            checked_at = (row.get("checked_at") or "").strip()
            if not any((title, provider, source_url, checked_at)):
                continue
            if not all((title, provider, source_url, checked_at)):
                raise ValueError(f"{path}:{line} must fill every column")
            if provider not in provider_urls:
                raise ValueError(f"{path}:{line} has unknown provider {provider!r}")
            parsed_url = urlsplit(source_url)
            if parsed_url.scheme != "https" or not parsed_url.netloc:
                raise ValueError(f"{path}:{line} source_url must be an HTTPS URL")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", checked_at):
                raise ValueError(f"{path}:{line} checked_at must use YYYY-MM-DD")
            try:
                date.fromisoformat(checked_at)
            except ValueError as exc:
                raise ValueError(f"{path}:{line} has invalid checked_at {checked_at!r}") from exc

            key = title_key(canonical_title(title, aliases))
            work = works_by_title.get(key)
            if work is None:
                raise ValueError(f"{path}:{line} title {title!r} does not match a generated work")
            override_key = (key, provider)
            if override_key in seen:
                raise ValueError(f"{path}:{line} duplicates provider {provider!r} for {title!r}")
            seen.add(override_key)
            vods = work.setdefault("vods", [])
            if provider not in vods:
                vods.append(provider)


def write_vod_audit(rows, path=_VOD_AUDIT_PATH):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["title", "official_url", "sources"])
        writer.writerows(rows)
