"""Duo / team chemistry from match histories (and demos when available).

FACEIT's Data API does not expose party membership for matchmaking, so co-occurrence is never called a
"party". Categories: insufficient_evidence < frequently_observed < possible_duo < established_cooperation
(the last one requires positional/trade evidence from parsed demos).
"""

from itertools import combinations
from typing import Any

import numpy as np

from .features import PlayerFeatures

CATS = {
    "insufficient_evidence": "Недостаточно данных",
    "frequently_observed": "Часто встречаются вместе",
    "possible_duo": "Возможное дуо",
    "established_cooperation": "Устойчивое взаимодействие",
}


def team_pairs(team: list[PlayerFeatures], demo_synergy=None) -> list[dict[str, Any]]:
    out = []
    for a, b in combinations(team, 2):
        shared = max(a.history_teammates.get(b.player_id, 0), b.history_teammates.get(a.player_id, 0))
        base = (
            min(x for x in (a.history_matches, b.history_matches) if x)
            if (a.history_matches and b.history_matches)
            else 0
        )
        share = shared / base if base else 0.0
        together = a.history_together.get(b.player_id) or b.history_together.get(a.player_id) or []
        decided = [w for _, w in together if w is not None]
        wr_together = sum(decided) / len(decided) if decided else None
        # joint per-match performance on matches present in both recent stat lists
        ra = {m.match_id: m for m in a.recent}
        rb = {m.match_id: m for m in b.recent}
        common = [mid for mid in ra if mid in rb and mid]

        def avg_rating(rec, ids):
            vals = [rec[i].rating for i in ids if rec[i].rating is not None]
            return float(np.mean(vals)) if vals else None

        apart_a = [i for i in ra if i not in rb]
        apart_b = [i for i in rb if i not in ra]
        maps: dict[str, int] = {}
        for mid in common:
            if ra[mid].map:
                maps[ra[mid].map] = maps.get(ra[mid].map, 0) + 1
        cat = "insufficient_evidence"
        if shared >= 3 and share >= 0.2:
            cat = "frequently_observed"
        if shared >= 6 and share >= 0.4:
            cat = "possible_duo"
        syn = demo_synergy(a, b) if demo_synergy else None
        if (
            cat == "possible_duo"
            and syn
            and syn.get("level") != "insufficient"
            and (
                (syn.get("a_trades_b", 0) + syn.get("b_trades_a", 0)) >= 2
                or (syn.get("colocation_rate") or 0) >= 0.4
            )
        ):
            cat = "established_cooperation"
        out.append(
            {
                "a": a.player_id,
                "b": b.player_id,
                "a_name": a.nickname,
                "b_name": b.nickname,
                "shared_matches": shared,
                "history_window": base,
                "share": round(share, 2),
                "win_rate_together": round(wr_together, 2) if wr_together is not None else None,
                "together_n": len(decided),
                "rating_together": {
                    "a": _r(avg_rating(ra, common)),
                    "b": _r(avg_rating(rb, common)),
                    "n": len(common),
                },
                "rating_apart": {"a": _r(avg_rating(ra, apart_a)), "b": _r(avg_rating(rb, apart_b))},
                "maps_together": sorted(maps.items(), key=lambda kv: -kv[1])[:3],
                "category": cat,
                "category_label": CATS[cat],
                "demo_evidence": syn,
                "note": "Состав пати FACEIT Data API не подтверждает — это частота совместных матчей.",
            }
        )
    out.sort(key=lambda p: (-list(CATS).index(p["category"]), -p["shared_matches"]))
    return out


def groups(pairs: list[dict[str, Any]]) -> list[list[str]]:
    """Connected components over possible_duo/established links (likely premade groups, unconfirmed)."""
    adj: dict[str, set[str]] = {}
    for p in pairs:
        if p["category"] in ("possible_duo", "established_cooperation"):
            adj.setdefault(p["a_name"], set()).add(p["b_name"])
            adj.setdefault(p["b_name"], set()).add(p["a_name"])
    seen, comps = set(), []
    for n in adj:
        if n in seen:
            continue
        stack, comp = [n], []
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.append(x)
            stack.extend(adj[x] - seen)
        comps.append(sorted(comp))
    return comps


def _r(v):
    return round(v, 2) if v is not None else None
