"""Positional profiles from accumulated demo observations, with explicit evidence levels.

Evidence levels (never upgraded without data):
* "insufficient" — fewer than MIN_ROUNDS observed rounds on that side/map, or no dominant area;
* "preliminary"  — MIN_ROUNDS..STRONG_ROUNDS rounds and the Wilson lower bound of the top area share >= 0.35;
* "pattern"      — >= STRONG_ROUNDS rounds and the same bound holds.
"""

from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..analytics.stats_utils import wilson
from ..db import TacticalSample

MIN_ROUNDS = 8
STRONG_ROUNDS = 20
SHARE_FLOOR = 0.35
MIN_DUELS = 6


def fingerprint(tactical: dict[str, Any]) -> str:
    """Content key of a parsed demo: re-uploading the same match (even as a different file/archive) maps to
    the same key, so positional evidence is never counted twice."""
    import hashlib
    import json

    core = {
        "map": tactical.get("map"),
        "samples": [
            (s["steam_id"], s["round"], s["kind"], s["phase"], s["x"], s["y"])
            for s in tactical.get("samples", [])
        ],
    }
    return "t" + hashlib.sha256(json.dumps(core, sort_keys=True).encode()).hexdigest()[:31]


def ingest(session: Session, demo_id: str, tactical: dict[str, Any]) -> int:
    session.execute(delete(TacticalSample).where(TacticalSample.demo_id == demo_id))
    rows = [
        TacticalSample(
            demo_id=demo_id,
            steam_id=s["steam_id"],
            map=tactical["map"],
            round=s["round"],
            side=s["side"],
            kind=s["kind"],
            phase=s["phase"],
            place=s["place"],
            x=s["x"],
            y=s["y"],
            teammates=s.get("teammates"),
        )
        for s in tactical.get("samples", [])
        if s["side"] in ("T", "CT")
    ]
    rows += [
        TacticalSample(
            demo_id=demo_id,
            steam_id=t["trader"],
            map=tactical["map"],
            round=t["round"],
            side="?",
            kind="trade",
            phase="-",
            place=t.get("place"),
            x=0,
            y=0,
            teammates=[t["traded"]],
        )
        for t in tactical.get("trades", [])
    ]
    session.add_all(rows)
    return len(rows)


def _level(n: int, top: int) -> tuple[str, list[float]]:
    lo, hi = wilson(top, n)
    if n < MIN_ROUNDS or lo < SHARE_FLOOR:
        return "insufficient", [round(lo, 2), round(hi, 2)]
    return ("pattern" if n >= STRONG_ROUNDS else "preliminary"), [round(lo, 2), round(hi, 2)]


def _side_profile(map_name: str, rows: list[TacticalSample]) -> dict[str, Any]:
    from .zones import macro_area

    setup = [r for r in rows if r.kind == "position" and r.phase == "early"]
    rounds = {(r.demo_id, r.round) for r in setup}
    n = len(rounds)
    areas = Counter(macro_area(map_name, r.place) for r in setup)
    places = Counter(r.place for r in setup if r.place)
    top_area, top_count = areas.most_common(1)[0] if areas else ("other", 0)
    level, ci = _level(n, top_count)
    isolated = sum(1 for r in rows if r.kind == "position" and not r.teammates)
    pos_total = sum(1 for r in rows if r.kind == "position")
    openings_w = [r for r in rows if r.kind == "opening_win"]
    openings_l = [r for r in rows if r.kind == "opening_loss"]
    duel_by_area: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for r in rows:
        if r.kind in ("duel_win", "opening_win"):
            duel_by_area[macro_area(map_name, r.place)][0] += 1
        elif r.kind in ("duel_loss", "opening_loss"):
            duel_by_area[macro_area(map_name, r.place)][1] += 1
    return {
        "rounds": n,
        "setup_areas": [
            {"area": a, "count": c, "share": round(c / n, 2) if n else 0} for a, c in areas.most_common()
        ],
        "top_places": [{"place": p, "count": c} for p, c in places.most_common(4)],
        "primary_area": {
            "area": top_area,
            "share": round(top_count / n, 2) if n else 0,
            "ci95": ci,
            "level": level,
        },
        "isolation_rate": round(isolated / pos_total, 2) if pos_total else None,
        "openings": {
            "wins": len(openings_w),
            "losses": len(openings_l),
            "areas": Counter(macro_area(map_name, r.place) for r in openings_w + openings_l).most_common(3),
        },
        "duels_by_area": {
            a: {"wins": w, "losses": lo, "level": "ok" if w + lo >= MIN_DUELS else "insufficient"}
            for a, (w, lo) in duel_by_area.items()
        },
    }


def player_profiles(session: Session, steam_ids: list[str], map_name: str | None = None) -> dict[str, Any]:
    q = select(TacticalSample).where(TacticalSample.steam_id.in_(steam_ids), TacticalSample.kind != "trade")
    if map_name:
        q = q.where(TacticalSample.map == map_name)
    by_player: dict[str, dict[str, dict[str, list[TacticalSample]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )
    for r in session.scalars(q):
        by_player[r.steam_id][r.map][r.side].append(r)
    out: dict[str, Any] = {}
    for sid in steam_ids:
        maps = {}
        for m, sides in by_player.get(sid, {}).items():
            maps[m] = {
                "demos": len({r.demo_id for rows in sides.values() for r in rows}),
                "sides": {side: _side_profile(m, rows) for side, rows in sides.items()},
            }
        out[sid] = {"maps": maps, "observed": bool(maps)}
    return out


def pair_synergy(session: Session, a: str, b: str, map_name: str | None = None) -> dict[str, Any]:
    q = select(TacticalSample).where(TacticalSample.steam_id.in_([a, b]))
    if map_name:
        q = q.where(TacticalSample.map == map_name)
    rows = list(session.scalars(q))
    shared_rounds = {(r.demo_id, r.round) for r in rows if r.steam_id == a and r.kind == "position"} & {
        (r.demo_id, r.round) for r in rows if r.steam_id == b and r.kind == "position"
    }
    together = Counter()
    for r in rows:
        if r.kind == "position" and r.steam_id == a and r.teammates and b in r.teammates:
            together[r.place] += 1
    a_trades_b = sum(1 for r in rows if r.kind == "trade" and r.steam_id == a and b in (r.teammates or []))
    b_trades_a = sum(1 for r in rows if r.kind == "trade" and r.steam_id == b and a in (r.teammates or []))
    pos_a = sum(
        1 for r in rows if r.kind == "position" and r.steam_id == a and (r.demo_id, r.round) in shared_rounds
    )
    return {
        "shared_rounds": len(shared_rounds),
        "colocation_rate": round(sum(together.values()) / pos_a, 2) if pos_a else None,
        "colocation_places": together.most_common(3),
        "a_trades_b": a_trades_b,
        "b_trades_a": b_trades_a,
        "level": "insufficient"
        if len(shared_rounds) < MIN_ROUNDS
        else ("pattern" if len(shared_rounds) >= STRONG_ROUNDS else "preliminary"),
    }


def map_points(
    session: Session, map_name: str, steam_ids: list[str] | None = None, limit: int = 4000
) -> list[dict]:
    """Radar-space points for drawing (background density from every observation on that map)."""
    from .zones import macro_area, to_radar

    q = select(TacticalSample).where(TacticalSample.map == map_name, TacticalSample.kind != "trade")
    if steam_ids:
        q = q.where(TacticalSample.steam_id.in_(steam_ids))
    pts = []
    for r in session.scalars(q.limit(limit)):
        rad = to_radar(map_name, r.x, r.y)
        if rad:
            pts.append(
                {
                    "steam_id": r.steam_id,
                    "x": round(rad[0], 1),
                    "y": round(rad[1], 1),
                    "kind": r.kind,
                    "side": r.side,
                    "phase": r.phase,
                    "place": r.place,
                    "area": macro_area(map_name, r.place),
                }
            )
    return pts


def place_centroids(session: Session, map_name: str) -> list[dict]:
    from .zones import to_radar

    acc: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0])
    for r in session.scalars(
        select(TacticalSample).where(TacticalSample.map == map_name, TacticalSample.kind == "position")
    ):
        if r.place:
            a = acc[r.place]
            a[0] += r.x
            a[1] += r.y
            a[2] += 1
    out = []
    for place, (sx, sy, n) in acc.items():
        rad = to_radar(map_name, sx / n, sy / n)
        if rad and n >= 3:
            out.append({"place": place, "x": round(rad[0], 1), "y": round(rad[1], 1), "n": n})
    return out
