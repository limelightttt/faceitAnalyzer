"""Personal coaching built from the player's own matches and parsed demos.

* Metrics come from FACEIT per-match stats (all matches) or from parsed demos (only demos containing the
  player's SteamID). Every goal freezes its baseline at creation; progress uses only later matches/demos.
* Suggestions are generated only from lobby-relative weaknesses (analytics/insights.py) — no generic advice.
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any

import numpy as np

from .domain import PlayerDataset, PlayerMatch

# metric -> (label, direction where "better" is, source, unit, formatter digits)
METRICS: dict[str, dict[str, Any]] = {
    "entry_death_rate": {
        "label": "Первые смерти за раунд (FACEIT entry)",
        "better": "down",
        "source": "faceit",
        "digits": 3,
    },
    "entry_success": {
        "label": "Успешность первых дуэлей",
        "better": "up",
        "source": "faceit",
        "digits": 3,
        "pct": True,
    },
    "adr": {"label": "ADR", "better": "up", "source": "faceit", "digits": 1},
    "kd": {"label": "K/D", "better": "up", "source": "faceit", "digits": 2},
    "rating": {"label": "Rating 1.0", "better": "up", "source": "faceit", "digits": 2},
    "hs": {"label": "Headshot %", "better": "up", "source": "faceit", "digits": 1},
    "utility_dpr": {"label": "Урон гранатами за раунд", "better": "up", "source": "faceit", "digits": 2},
    "flashed_pr": {"label": "Ослеплено врагов за раунд", "better": "up", "source": "faceit", "digits": 3},
    "map_win_rate": {
        "label": "Win rate на карте",
        "better": "up",
        "source": "faceit",
        "digits": 3,
        "pct": True,
        "needs_map": True,
    },
    "traded_death_rate": {
        "label": "Доля разменянных смертей (демки)",
        "better": "up",
        "source": "demo",
        "digits": 3,
        "pct": True,
    },
    "opening_death_rate": {
        "label": "Opening-смерти за раунд (демки)",
        "better": "down",
        "source": "demo",
        "digits": 3,
    },
    "trade_kills_pr": {
        "label": "Трейд-киллы за раунд (демки)",
        "better": "up",
        "source": "demo",
        "digits": 3,
    },
}
WINDOW = 20
MIN_PROGRESS_N = 5


def match_metric(pm: PlayerMatch, metric: str) -> tuple[float, float] | None:
    """(value_sum, weight) for pooled averaging; None if unavailable."""
    s = pm.stats
    rounds = pm.match.rounds or 0
    if s is None or rounds == 0:
        return None
    if metric == "entry_death_rate" and s.entry_count is not None and s.entry_wins is not None:
        return (s.entry_count - s.entry_wins, rounds)
    if metric == "entry_success" and s.entry_count:
        return (s.entry_wins or 0, s.entry_count)
    if metric == "adr" and s.adr is not None:
        return (s.adr, 1)
    if metric == "kd":
        return (s.kills, max(s.deaths, 1))
    if metric == "rating":
        return (s.rating, 1)
    if metric == "hs":
        return (s.hs_pct, 1)
    if metric == "utility_dpr" and s.utility_damage is not None:
        return (s.utility_damage, rounds)
    if metric == "flashed_pr" and s.enemies_flashed is not None:
        return (s.enemies_flashed, rounds)
    return None


def pooled(values: list[tuple[float, float]]) -> float | None:
    w = sum(v[1] for v in values)
    return sum(v[0] for v in values) / w if w else None


def faceit_series(
    ds: PlayerDataset, metric: str, map_name: str | None = None
) -> list[tuple[datetime | None, tuple[float, float]]]:
    out = []
    for pm in reversed(ds.matches):  # oldest first
        if map_name and pm.match.map != map_name:
            continue
        if metric == "map_win_rate":
            if pm.won is not None:
                out.append((pm.match.started_at, (1.0 if pm.won else 0.0, 1)))
            continue
        v = match_metric(pm, metric)
        if v is not None:
            out.append((pm.match.started_at, v))
    return out


def demo_rows(analyses: list[tuple[str, str, dict]], steam_id: str | None) -> list[dict[str, Any]]:
    """Per-demo metrics for the player (analyses: (demo_id, created_at_iso, analysis))."""
    rows = []
    if not steam_id:
        return rows
    for demo_id, created, a in analyses:
        p = next((x for x in a.get("players", []) if x["steamid"] == steam_id), None)
        if not p or not p["rounds"]:
            continue
        deaths_places = Counter()
        untraded = Counter()
        for r in a.get("rounds", []):
            for k in r["kills"]:
                if k["victim"] == steam_id and not k["team_kill"]:
                    deaths_places[k.get("victim_place") or "?"] += 1
                    if not k["traded"]:
                        untraded[k.get("victim_place") or "?"] += 1
        rows.append(
            {
                "demo_id": demo_id,
                "created_at": created,
                "map": a.get("map"),
                "rounds": p["rounds"],
                "kast": p["kast"],
                "adr": p["adr"],
                "rating": p["rating"],
                "opening_death_rate": p["opening_deaths"] / p["rounds"],
                "traded_death_rate": p["traded_deaths"] / p["deaths"] if p["deaths"] else None,
                "trade_kills_pr": p["trade_kills"] / p["rounds"],
                "deaths": p["deaths"],
                "team_flashed": p["team_flashed"],
                "enemies_flashed": p["enemies_flashed"],
                "death_places": deaths_places.most_common(5),
                "untraded_places": untraded.most_common(5),
            }
        )
    return rows


def repeated_mistakes(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Patterns that repeat across >= 2 demos; each item carries counts, never a generic tip."""
    if len(rows) < 2:
        return []
    out = []
    total_deaths = sum(r["deaths"] for r in rows)
    untraded = Counter()
    for r in rows:
        for place, n in r["untraded_places"]:
            untraded[place] += n
    demos_with = defaultdict(int)
    for r in rows:
        for place, _ in r["untraded_places"]:
            demos_with[place] += 1
    for place, n in untraded.most_common(3):
        if demos_with[place] >= 2 and n >= 3 and place != "?":
            out.append(
                {
                    "kind": "untraded_deaths_place",
                    "text": f"Неразменянные смерти в зоне {place}: {n} "
                    f"(в {demos_with[place]} демках из {len(rows)}).",
                    "evidence": {"place": place, "count": n},
                }
            )
    tf = sum(r["team_flashed"] for r in rows)
    ef = sum(r["enemies_flashed"] for r in rows)
    if tf >= 4 and tf > ef:
        out.append(
            {
                "kind": "team_flashes",
                "text": f"Флешки чаще слепят своих ({tf}), чем врагов ({ef}) — суммарно по {len(rows)} демкам.",
                "evidence": {"team_flashed": tf, "enemies_flashed": ef},
            }
        )
    od = [r["opening_death_rate"] for r in rows]
    if np.mean(od) >= 0.15 and len(rows) >= 2:
        out.append(
            {
                "kind": "opening_deaths",
                "text": f"Частые opening-смерти: {np.mean(od):.2f} за раунд в среднем по {len(rows)} демкам "
                "(каждая — раунд 4v5 для команды).",
                "evidence": {"rate": round(float(np.mean(od)), 3)},
            }
        )
    if total_deaths:
        traded = [r["traded_death_rate"] for r in rows if r["traded_death_rate"] is not None]
        if traded and np.mean(traded) < 0.25:
            out.append(
                {
                    "kind": "untraded",
                    "text": f"Разменивается лишь {np.mean(traded):.0%} смертей — "
                    "позиции далеко от тиммейтов или без поддержки.",
                    "evidence": {"rate": round(float(np.mean(traded)), 3)},
                }
            )
    return out


def weekly(ds: PlayerDataset, tz_offset_hours: int = 0) -> list[dict[str, Any]]:
    buckets: dict[str, list[PlayerMatch]] = defaultdict(list)
    for pm in ds.matches:
        if pm.match.started_at:
            d = pm.match.started_at + timedelta(hours=tz_offset_hours)
            y, w, _ = d.isocalendar()
            buckets[f"{y}-W{w:02d}"].append(pm)
    out = []
    for week in sorted(buckets):
        ms = buckets[week]
        st = [m for m in ms if m.stats]
        dec = [m for m in ms if m.won is not None]
        out.append(
            {
                "week": week,
                "matches": len(ms),
                "wins": sum(1 for m in dec if m.won),
                "win_rate": round(sum(1 for m in dec if m.won) / len(dec), 3) if dec else None,
                "rating": round(float(np.mean([m.stats.rating for m in st])), 3) if st else None,
                "adr": round(float(np.mean([m.stats.adr for m in st if m.stats.adr is not None])), 1)
                if st
                else None,
                "kd": round(sum(m.stats.kills for m in st) / max(1, sum(m.stats.deaths for m in st)), 2)
                if st
                else None,
                "maps": Counter(m.match.map for m in ms if m.match.map).most_common(3),
            }
        )
    for i in range(1, len(out)):
        prev, cur = out[i - 1], out[i]
        notes = []
        if (
            cur["rating"] is not None
            and prev["rating"] is not None
            and cur["matches"] >= 5
            and prev["matches"] >= 5
        ):
            d = cur["rating"] - prev["rating"]
            if abs(d) >= 0.08:
                notes.append(f"Rating {'вырос' if d > 0 else 'снизился'} на {abs(d):.2f}")
        if cur["matches"] < 5:
            notes.append("мало матчей — изменения не интерпретируются")
        cur["notes"] = notes
    if out:
        out[0]["notes"] = []
    return out[::-1]
