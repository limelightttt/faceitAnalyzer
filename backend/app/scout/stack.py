"""Map pool of players who queue together (a duo or a full stack).

Every number is shrunk toward something less noisy, so a lucky 3-0 never outranks a solid 40-game map:
  1. a player's older results on the map (lifetime minus the recent window) are pulled toward 50%;
  2. their recent results on the map (last ~100 matches) are pulled toward that older value;
  3. the stack baseline is the mean of the players; matches the group played *together* (same team in the
     history window) move it, again shrunk, so a handful of games only nudges it.
Maps where someone has almost no experience are listed last and marked. Verdicts are suggestions with their
sample sizes shown, never a guarantee.
"""

from typing import Any

from .features import PlayerFeatures

SHRINK = 10  # pseudo-matches each level of evidence is pulled toward its prior
MIN_EXPERIENCE = 5  # fewer matches on a map than this: "мало опыта"
PICK, BAN = 0.53, 0.47


def _shrink(wins: float, n: float, prior: float) -> float:
    return (wins + prior * SHRINK) / (n + SHRINK)


def _together(players: list[PlayerFeatures]) -> list[tuple[str, bool | None]]:
    """Matches in which every player of the group was on the same team (from the first player's history)."""
    if len(players) < 2:
        return []
    head, rest = players[0], players[1:]
    shared = set.intersection(*({mid for mid, _ in head.history_together.get(p.player_id, [])} for p in rest))
    return [(mid, won) for mid, won in head.history_together.get(rest[0].player_id, []) if mid in shared]


def _player_map(p: PlayerFeatures, m: str) -> dict[str, Any]:
    seg = p.map_segments.get(m) or {}
    n = int(seg.get("matches") or 0)
    wr = seg.get("win_rate")
    recent = [r.won for r in p.recent if r.map == m and r.won is not None]
    # lifetime already contains the recent matches: use only the older part as the prior
    older = _shrink(max(0.0, (wr or 0) * n - sum(recent)), max(0, n - len(recent)), 0.5)
    return {
        "player_id": p.player_id,
        "nickname": p.nickname,
        "matches": n,
        "win_rate": wr,
        "recent_matches": len(recent),
        "recent_win_rate": round(sum(recent) / len(recent), 3) if recent else None,
        "score": _shrink(sum(recent), len(recent), older),
    }


def stack_map_pool(players: list[PlayerFeatures]) -> dict[str, Any]:
    together = _together(players)
    map_of = {r.match_id: r.map for p in players for r in p.recent if r.map}
    # the current pool is what these players actually queue now; lifetime segments also list retired maps
    current = {r.map for p in players for r in p.recent if r.map}
    maps = sorted(current or {m for p in players for m in p.map_segments})
    rows = []
    for m in maps:
        per = [_player_map(p, m) for p in players]
        baseline = sum(x["score"] for x in per) / len(per)
        tog = [won for mid, won in together if map_of.get(mid) == m and won is not None]
        score = _shrink(sum(tog), len(tog), baseline)
        rookies = [x["nickname"] for x in per if x["matches"] < MIN_EXPERIENCE]
        min_matches = min(x["matches"] for x in per)
        rows.append(
            {
                "map": m,
                "score": round(score, 3),
                "verdict": "ban" if rookies or score <= BAN else "pick" if score >= PICK else "neutral",
                "confidence": "low" if min_matches < 20 and len(tog) < 5 else "medium",
                "inexperienced": rookies,
                "together_matches": len(tog),
                "together_win_rate": round(sum(tog) / len(tog), 3) if tog else None,
                "players": [{k: v for k, v in x.items() if k != "score"} for x in per],
            }
        )
    rows.sort(key=lambda r: (bool(r["inexperienced"]), -r["score"]))
    decided = [won for _, won in together if won is not None]
    return {
        "players": [
            {
                "player_id": p.player_id,
                "nickname": p.nickname,
                "elo": p.elo,
                "avatar": p.avatar,
                "errors": p.errors,
            }
            for p in players
        ],
        "together": {
            "matches": len(together),
            "history_window": min((p.history_matches for p in players), default=0),
            "win_rate": round(sum(decided) / len(decided), 3) if decided else None,
        },
        "maps": rows,
        "method": "Lifetime → последние матчи → совместные игры: каждый уровень сглажен к предыдущему "
        f"({SHRINK} условных матчей), малые выборки тянутся к 50%. «Мало опыта» — меньше {MIN_EXPERIENCE} "
        "матчей на карте у кого-то из группы.",
    }
