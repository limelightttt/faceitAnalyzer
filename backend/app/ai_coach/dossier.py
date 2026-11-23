"""The dossier: facts about the player computed by the app, each with a stable id the model cites.

Only numbers the app already shows elsewhere go in (FACEIT stats, lobby comparison, weekly form, demos,
goals, observed Elo). The JSON is deterministic, so the same data hashes the same and is never billed twice.
"""

import hashlib
import json
from collections import defaultdict
from datetime import datetime
from typing import Any

import numpy as np

from ..domain import PlayerDataset, PlayerMatch

RECENT = 20  # "now": the last 20 matches
BEFORE = 40  # compared with the 40 matches before them
MAP_WINDOW = 60
MIN_MAP_MATCHES = 5
FORM_LABELS = {
    "win_rate": "Win rate",
    "rating": "Rating 1.0",
    "adr": "ADR",
    "kd": "K/D",
    "hs_pct": "Headshot %",
    "opponents_elo_gap": "Elo соперников минус Elo вашей команды",
}


def _fact(label: str, value: Any, n: int | None = None) -> dict[str, Any]:
    return {"label": label, "value": value} | ({"n": n} if n is not None else {})


def _form(ms: list[PlayerMatch]) -> dict[str, Any] | None:
    dec = [m for m in ms if m.won is not None]
    st = [m.stats for m in ms if m.stats]
    if not dec:
        return None
    adr = [s.adr for s in st if s.adr is not None]
    elo_gap = [m.opp_avg_elo - m.team_avg_elo for m in ms if m.opp_avg_elo and m.team_avg_elo]
    return {
        "n": len(dec),
        "win_rate": round(sum(m.won for m in dec) / len(dec), 3),
        "rating": round(float(np.mean([s.rating for s in st])), 2) if st else None,
        "adr": round(float(np.mean(adr)), 1) if adr else None,
        "kd": round(sum(s.kills for s in st) / max(1, sum(s.deaths for s in st)), 2) if st else None,
        "hs_pct": round(float(np.mean([s.hs_pct for s in st])), 1) if st else None,
        "opponents_elo_gap": round(float(np.mean(elo_gap))) if elo_gap else None,
    }


def build(
    ds: PlayerDataset,
    insights: dict[str, Any],
    weekly: list[dict[str, Any]],
    demo_rows: list[dict[str, Any]],
    mistakes: list[dict[str, Any]],
    goals: list[dict[str, Any]],
    elo_history: list[tuple[datetime, int]],
) -> dict[str, Any]:
    facts: dict[str, dict[str, Any]] = {}
    p = ds.profile
    facts["profile.elo"] = _fact("Текущий Elo", p.elo)
    facts["profile.level"] = _fact("Уровень FACEIT", p.skill_level)
    if len(elo_history) >= 2:
        elos = [e for _, e in elo_history]
        facts["elo.observed"] = _fact(
            f"Elo по наблюдениям приложения с {elo_history[0][0]:%Y-%m-%d}",
            {"first": elos[0], "peak": max(elos), "low": min(elos), "last": elos[-1]},
            len(elos),
        )

    for key, ms in (("recent", ds.matches[:RECENT]), ("before", ds.matches[RECENT : RECENT + BEFORE])):
        f = _form(ms)
        if f:
            label = "последние матчи" if key == "recent" else "матчи перед ними"
            n = f.pop("n")
            for metric, value in f.items():
                if value is not None:
                    facts[f"form.{key}.{metric}"] = _fact(f"{FORM_LABELS[metric]} — {label}", value, n)

    window = ds.matches[:MAP_WINDOW]
    for party, label in ((True, "в пати"), (False, "соло")):
        f = _form([m for m in window if (m.party_size > 1) == party])
        if f and f["n"] >= MIN_MAP_MATCHES:
            facts[f"form.{'party' if party else 'solo'}.win_rate"] = _fact(
                f"Win rate {label}", f["win_rate"], f["n"]
            )

    by_map: dict[str, list[PlayerMatch]] = defaultdict(list)
    for m in window:
        if m.match.map:
            by_map[m.match.map].append(m)
    for name in sorted(by_map):
        f = _form(by_map[name])
        if f and f["n"] >= MIN_MAP_MATCHES:
            facts[f"map.{name}"] = _fact(
                f"{name}: последние {MAP_WINDOW} матчей",
                {k: f[k] for k in ("win_rate", "rating", "adr") if f[k] is not None},
                f["n"],
            )

    for it in insights["items"]:
        if it["status"] != "insufficient_data":
            facts[f"lobby.{it['key']}"] = _fact(
                f"{it['label']}: вы против остальных 9 игроков тех же матчей",
                {
                    "you": it["player"],
                    "lobby": it["lobby"],
                    "verdict": it["status"],
                    "confidence": it["confidence"],
                },
                it["n"],
            )

    for w in weekly[:6]:
        facts[f"week.{w['week']}"] = _fact(
            f"Неделя {w['week']}",
            {k: w[k] for k in ("matches", "win_rate", "rating", "adr") if w[k] is not None},
            w["matches"],
        )

    if demo_rows:
        for metric, label in (
            ("kast", "KAST, %"),
            ("opening_death_rate", "Opening-смерти за раунд"),
            ("traded_death_rate", "Доля разменянных смертей"),
            ("trade_kills_pr", "Трейд-киллы за раунд"),
        ):
            vals = [r[metric] for r in demo_rows if r[metric] is not None]
            if vals:
                facts[f"demo.{metric}"] = _fact(f"{label} (демки)", round(float(np.mean(vals)), 3), len(vals))
    for m in mistakes:
        facts[f"mistake.{m['kind']}"] = _fact("Повторяющаяся ошибка в демках", m["text"])

    for g in goals:
        pr = g["progress"]
        facts[f"goal.{g['id']}"] = _fact(
            f"Цель: {g['label']}" + (f" ({g['map']})" if g["map"] else ""),
            {
                "baseline": g["baseline"],
                "target": g["target"],
                "now": pr["current"],
                "reached": pr["reached"],
            },
            pr["n_after"],
        )

    return {
        "player": p.nickname,
        "matches_with_stats": insights["matches_used"],
        "demos": len(demo_rows),
        "facts": facts,
    }


def digest(dossier: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(dossier, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
