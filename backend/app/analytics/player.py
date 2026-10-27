"""Player overview: totals, trends, maps, best/worst matches."""

from collections import defaultdict
from typing import Any

import numpy as np

from ..domain import PlayerDataset, PlayerMatch
from .stats_utils import r, wilson

COMPARE_METRICS = [
    ("rating", "Rating 1.0"),
    ("kr", "K/R"),
    ("adr", "ADR"),
    ("hs_pct", "HS %"),
    ("deaths_pr", "Смертей/раунд"),
    ("entry_success", "Entry success"),
    ("utility_dpr", "Utility dmg/раунд"),
    ("flashed_pr", "Ослеплено/раунд"),
    ("multikill_pr", "Мультикиллы/раунд"),
]


def match_row(pm: PlayerMatch) -> dict[str, Any]:
    m, s = pm.match, pm.stats
    row: dict[str, Any] = {
        "match_id": m.match_id,
        "map": m.map,
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "won": pm.won,
        "score_for": pm.score_for,
        "score_against": pm.score_against,
        "rounds": m.rounds,
        "team_avg_elo": r(pm.team_avg_elo, 0),
        "opp_avg_elo": r(pm.opp_avg_elo, 0),
        "win_probability": r(pm.win_probability),
        "party_size": pm.party_size,
        "party_members": pm.party_members,
        "faceit_url": m.faceit_url,
        "has_stats": s is not None,
    }
    if s:
        rounds = m.rounds or 1
        row.update(
            {
                "kills": s.kills,
                "deaths": s.deaths,
                "assists": s.assists,
                "adr": s.adr,
                "hs_pct": s.hs_pct,
                "kd": s.kd,
                "kr": s.kr,
                "rating": s.rating,
                "mvps": s.mvps,
                "multi_kills": {
                    "2k": s.double_kills,
                    "3k": s.triple_kills,
                    "4k": s.quadro_kills,
                    "5k": s.penta_kills,
                },
                "entry_count": s.entry_count,
                "entry_wins": s.entry_wins,
                "utility_damage": s.utility_damage,
                "enemies_flashed": s.enemies_flashed,
                "clutch_1v1": [s.clutch_1v1_wins, s.clutch_1v1_count],
                "clutch_1v2": [s.clutch_1v2_wins, s.clutch_1v2_count],
                "deaths_pr": r(s.deaths / rounds),
                "entry_success": r(s.entry_wins / s.entry_count) if s.entry_count else None,
                "utility_dpr": r((s.utility_damage or 0) / rounds) if s.utility_damage is not None else None,
                "flashed_pr": r((s.enemies_flashed or 0) / rounds) if s.enemies_flashed is not None else None,
                "multikill_pr": r(
                    (s.double_kills + s.triple_kills + s.quadro_kills + s.penta_kills) / rounds
                ),
            }
        )
    return row


def _mean(rows: list[dict], key: str) -> float | None:
    vals = [x[key] for x in rows if x.get(key) is not None]
    return r(float(np.mean(vals))) if vals else None


def overview(ds: PlayerDataset) -> dict[str, Any]:
    rows = [match_row(pm) for pm in ds.matches]
    with_stats = [x for x in rows if x["has_stats"]]
    decided = [x for x in rows if x["won"] is not None]
    wins = sum(1 for x in decided if x["won"])
    kills = sum(x["kills"] for x in with_stats)
    deaths = sum(x["deaths"] for x in with_stats)
    lo, hi = wilson(wins, len(decided))

    # trend (oldest first) with rolling mean over 5 matches
    chrono = list(reversed(with_stats))
    ratings = np.array([x["rating"] for x in chrono], dtype=float)
    window = 5
    rolling = [float(ratings[max(0, i - window + 1) : i + 1].mean()) for i in range(len(ratings))]
    trend = [
        {
            "idx": i + 1,
            "match_id": x["match_id"],
            "started_at": x["started_at"],
            "map": x["map"],
            "won": x["won"],
            "rating": x["rating"],
            "adr": x["adr"],
            "kd": x["kd"],
            "kills": x["kills"],
            "rating_rolling": r(rolling[i]),
        }
        for i, x in enumerate(chrono)
    ]

    maps: dict[str, list[dict]] = defaultdict(list)
    for x in rows:
        if x["map"]:
            maps[x["map"]].append(x)
    map_stats = []
    for mp, xs in maps.items():
        dec = [x for x in xs if x["won"] is not None]
        w = sum(1 for x in dec if x["won"])
        ci = wilson(w, len(dec))
        st = [x for x in xs if x["has_stats"]]
        map_stats.append(
            {
                "map": mp,
                "matches": len(xs),
                "wins": w,
                "win_rate": r(w / len(dec)) if dec else None,
                "win_rate_ci": [r(ci[0]), r(ci[1])],
                "rating": _mean(st, "rating"),
                "adr": _mean(st, "adr"),
                "kd": r(sum(x["kills"] for x in st) / max(1, sum(x["deaths"] for x in st))),
            }
        )
    map_stats.sort(key=lambda m: -m["matches"])

    # form: recent 10 vs the rest
    recent, older = with_stats[:10], with_stats[10:]
    form = {
        "recent_n": len(recent),
        "older_n": len(older),
        "recent_rating": _mean(recent, "rating"),
        "older_rating": _mean(older, "rating"),
        "recent_win_rate": r(sum(1 for x in recent if x["won"]) / len(recent)) if recent else None,
    }

    # streak (newest first)
    streak = 0
    for x in decided:
        if streak == 0:
            streak = 1 if x["won"] else -1
        elif (streak > 0) == bool(x["won"]):
            streak += 1 if streak > 0 else -1
        else:
            break

    return {
        "totals": {
            "matches": len(rows),
            "with_stats": len(with_stats),
            "wins": wins,
            "losses": len(decided) - wins,
            "win_rate": r(wins / len(decided)) if decided else None,
            "win_rate_ci": [r(lo), r(hi)],
            "kd": r(kills / deaths) if deaths else None,
            "kills": kills,
            "deaths": deaths,
            "adr": _mean(with_stats, "adr"),
            "hs_pct": _mean(with_stats, "hs_pct"),
            "kr": _mean(with_stats, "kr"),
            "rating": _mean(with_stats, "rating"),
            "current_streak": streak,
            "multi_kills": {
                k: sum(x["multi_kills"][k] for x in with_stats) for k in ("2k", "3k", "4k", "5k")
            },
        },
        "form": form,
        "trend": trend,
        "maps": map_stats,
        "matches": rows,
    }


def best_worst(ds: PlayerDataset, n: int = 3) -> dict[str, Any]:
    rows = [match_row(pm) for pm in ds.matches if pm.stats]
    ranked = sorted(rows, key=lambda x: x["rating"], reverse=True)
    if len(ranked) < 2:
        return {"best": ranked, "worst": [], "comparison": [], "n": len(ranked)}
    n = min(n, len(ranked) // 2)
    best, worst = ranked[:n], ranked[-n:][::-1]
    comparison = []
    for key, label in COMPARE_METRICS:
        b, w, a = _mean(best, key), _mean(worst, key), _mean(rows, key)
        if b is None or w is None:
            continue
        comparison.append({"metric": key, "label": label, "best": b, "worst": w, "all": a, "delta": r(b - w)})
    ctx = {
        "best_party_share": r(np.mean([x["party_size"] > 1 for x in best])),
        "worst_party_share": r(np.mean([x["party_size"] > 1 for x in worst])),
        "best_maps": [x["map"] for x in best],
        "worst_maps": [x["map"] for x in worst],
        "best_win_rate": r(np.mean([bool(x["won"]) for x in best])),
        "worst_win_rate": r(np.mean([bool(x["won"]) for x in worst])),
    }
    return {
        "best": best,
        "worst": worst,
        "comparison": comparison,
        "context": ctx,
        "n": len(rows),
        "method": "Ранжирование по HLTV Rating 1.0 (приближение по статистике FACEIT); сравнение средних "
        "значений метрик в лучших и худших матчах.",
    }
