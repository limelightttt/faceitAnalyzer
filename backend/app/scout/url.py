import re

MATCH_ID_RE = re.compile(r"\b(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b", re.I)


def parse_match_ref(value: str) -> str | None:
    """Accepts a FACEIT matchroom URL (https://www.faceit.com/<lang>/cs2/room/1-…[/scoreboard]) or a bare id."""
    value = (value or "").strip()
    if len(value) > 300:
        return None
    m = MATCH_ID_RE.search(value)
    if not m:
        return None
    if value.startswith("http") and "faceit.com" not in value.split("/")[2]:
        return None
    return m.group(1).lower()
