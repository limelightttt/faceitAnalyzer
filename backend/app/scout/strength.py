"""Team strength comparison. Elo expectation is the only probability shown (FACEIT's own model family);
other factors are reported descriptively until a calibrated model exists (see predictions validation)."""

from typing import Any

import numpy as np

from .features import PlayerFeatures

ELO_SCALE = 400


def elo_expectation(a: float, b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((b - a) / ELO_SCALE))


def _wmean(pairs: list[tuple[float, float]]) -> float | None:
    tot = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / tot if tot else None


def team_summary(players: list[PlayerFeatures], map_name: str | None) -> dict[str, Any]:
    elos = [p.elo for p in players if p.elo is not None]
    recent = [p.recent_agg(20) for p in players]
    ratings = [r["rating"] for r in recent if r.get("rating") is not None]
    wrs = [(r["win_rate"], r["n"]) for r in recent if r.get("win_rate") is not None]
    lifetime = [p.lifetime_matches for p in players if p.lifetime_matches is not None]
    out: dict[str, Any] = {
        "avg_elo": round(float(np.mean(elos))) if elos else None,
        "median_elo": round(float(np.median(elos))) if elos else None,
        "elo_sd": round(float(np.std(elos))) if len(elos) > 1 else None,
        "elo_min": min(elos) if elos else None,
        "elo_max": max(elos) if elos else None,
        "elo_spread": (max(elos) - min(elos)) if elos else None,
        "recent_rating": round(float(np.mean(ratings)), 2) if ratings else None,
        "recent_win_rate": round(_wmean(wrs), 3) if wrs else None,
        "recent_matches_total": sum(r.get("n", 0) for r in recent),
        "median_lifetime_matches": int(np.median(lifetime)) if lifetime else None,
        "players_missing_data": [p.nickname for p in players if p.errors],
    }
    if map_name:
        seg = [(p.map_segments.get(map_name) or {}) for p in players]
        matches = [s.get("matches") or 0 for s in seg]
        wr = [(s["win_rate"], s.get("matches") or 0) for s in seg if s.get("win_rate") is not None]
        out["map"] = {
            "map": map_name,
            "total_matches": int(sum(matches)),
            "min_matches": int(min(matches)) if matches else 0,
            "win_rate": round(_wmean(wr), 3) if wr and _wmean(wr) is not None else None,
            "inexperienced": [p.nickname for p, m in zip(players, matches, strict=True) if m < 10],
        }
    return out


def _factor(key, label, a, b, higher_better=True, unit="", threshold=0.0, digits=2, note=""):
    if a is None or b is None:
        return {
            "key": key,
            "label": label,
            "a": a,
            "b": b,
            "favours": None,
            "magnitude": "unknown",
            "note": "нет данных",
        }
    diff = (a - b) if higher_better else (b - a)
    mag = abs(a - b)
    favours = None if mag <= threshold else ("a" if diff > 0 else "b")
    size = "small" if mag <= threshold * 2.5 else "medium" if mag <= threshold * 6 else "large"
    return {
        "key": key,
        "label": label,
        "a": round(a, digits) if isinstance(a, float) else a,
        "b": round(b, digits) if isinstance(b, float) else b,
        "favours": favours,
        "magnitude": "negligible" if favours is None else size,
        "unit": unit,
        "note": note,
    }


def compare(a: dict[str, Any], b: dict[str, Any], official_wp: float | None) -> dict[str, Any]:
    p = elo_expectation(a["avg_elo"], b["avg_elo"]) if a.get("avg_elo") and b.get("avg_elo") else None
    factors = [
        _factor(
            "avg_elo", "Средний Elo", a.get("avg_elo"), b.get("avg_elo"), threshold=15, digits=0, unit="Elo"
        ),
        _factor(
            "recent_rating",
            "Форма: Rating 1.0 за 20 матчей",
            a.get("recent_rating"),
            b.get("recent_rating"),
            threshold=0.03,
        ),
        _factor(
            "recent_win_rate",
            "Форма: доля побед за 20 матчей",
            a.get("recent_win_rate"),
            b.get("recent_win_rate"),
            threshold=0.04,
        ),
        _factor(
            "elo_spread",
            "Разброс Elo внутри команды",
            a.get("elo_spread"),
            b.get("elo_spread"),
            higher_better=False,
            threshold=60,
            digits=0,
            unit="Elo",
            note="больший разброс — больше зависимость от отдельных игроков",
        ),
        _factor(
            "experience",
            "Опыт: медиана матчей CS2",
            a.get("median_lifetime_matches"),
            b.get("median_lifetime_matches"),
            threshold=50,
            digits=0,
        ),
    ]
    if a.get("map") and b.get("map"):
        factors.append(
            _factor(
                "map_win_rate",
                f"Карта {a['map']['map']}: WR (lifetime)",
                a["map"].get("win_rate"),
                b["map"].get("win_rate"),
                threshold=0.03,
            )
        )
        factors.append(
            _factor(
                "map_matches",
                f"Карта {a['map']['map']}: матчей суммарно",
                a["map"]["total_matches"],
                b["map"]["total_matches"],
                threshold=40,
                digits=0,
            )
        )
    fav = [f for f in factors if f["favours"]]
    return {
        "elo_expectation": round(p, 3) if p is not None else None,
        "official_win_probability": round(official_wp, 3) if official_wp is not None else None,
        "elo_favours": None if p is None or abs(p - 0.5) < 0.02 else ("a" if p > 0.5 else "b"),
        "factors": factors,
        "factor_count": {
            "a": sum(1 for f in fav if f["favours"] == "a"),
            "b": sum(1 for f in fav if f["favours"] == "b"),
        },
        "model": "elo-baseline-v1",
        "calibrated": False,
        "uncertainty": "Elo-ожидание — базовая формула FACEIT/Elo (шкала 400), не откалиброванная на ваших матчах. "
        "Остальные факторы показаны описательно и не складываются в процент.",
    }


def threat_scores(all_players: list[PlayerFeatures], map_name: str | None) -> dict[str, dict[str, Any]]:
    """Within-lobby composite (z-scores): Elo, recent rating, recent ADR, map win rate (if >= 20 map matches)."""

    def z(values):
        arr = np.array([v if v is not None else np.nan for v in values], dtype=float)
        mu, sd = np.nanmean(arr), np.nanstd(arr)
        return np.where(np.isnan(arr), 0.0, (arr - mu) / (sd if sd > 0 else 1))

    recent = [p.recent_agg(20) for p in all_players]
    comps = {
        "elo": z([p.elo for p in all_players]),
        "rating": z([r.get("rating") for r in recent]),
        "adr": z([r.get("adr") for r in recent]),
        "map": z(
            [
                (p.map_segments.get(map_name) or {}).get("win_rate")
                if map_name and ((p.map_segments.get(map_name) or {}).get("matches") or 0) >= 20
                else None
                for p in all_players
            ]
        ),
    }
    weights = {"elo": 0.35, "rating": 0.35, "adr": 0.2, "map": 0.1}
    score = sum(weights[k] * comps[k] for k in comps)
    order = np.argsort(-score)
    out = {}
    for rank, i in enumerate(order, 1):
        p = all_players[i]
        out[p.player_id] = {
            "score": round(float(score[i]), 2),
            "rank": rank,
            "components": {k: round(float(comps[k][i]), 2) for k in comps},
        }
    return out


def stat_roles(p: PlayerFeatures, lobby: list[PlayerFeatures]) -> list[dict[str, Any]]:
    """Roles inferred from FACEIT per-match stats (not positions). Each carries its evidence."""
    r = p.recent_agg(20)
    roles = []
    if r.get("n", 0) < 8:
        return roles
    if (r.get("sniper_share") or 0) >= 0.3 and r.get("kills", 0) >= 80:
        roles.append(
            {
                "role": "AWP",
                "evidence": f"{r['sniper_share']:.0%} убийств со снайперских винтовок за {r['n']} матчей",
            }
        )
    entries = [x.recent_agg(20).get("entry_per_round") for x in lobby]
    entries = [e for e in entries if e is not None]
    epr = r.get("entry_per_round")
    if epr is not None and len(entries) >= 6 and epr >= np.percentile(entries, 80) and epr > 0.12:
        roles.append(
            {"role": "Entry", "evidence": f"{epr:.2f} попыток первой дуэли за раунд — верхние 20% лобби"}
        )
    return roles
