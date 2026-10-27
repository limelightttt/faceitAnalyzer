import re
from urllib.parse import urlparse

MATCH_ID_RE = re.compile(r"\b(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b", re.I)


def parse_match_ref(value: str) -> str | None:
    """Accepts a FACEIT matchroom URL (any language prefix, with or without scheme/www/suffix) or a bare id."""
    value = (value or "").strip()
    if not value or len(value) > 300:
        return None
    m = MATCH_ID_RE.search(value)
    if not m:
        return None
    if "/" in value:
        host = (urlparse(value if "://" in value else f"https://{value}").hostname or "").lower()
        if host != "faceit.com" and not host.endswith(".faceit.com"):
            return None
    return m.group(1).lower()
