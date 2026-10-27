"""Strengths / weaknesses relative to the player's own lobbies.

Method (paired, context-controlled): for each match we compare the focus player's metric with the mean
of the other 9 players in the same match. Mean paired difference + bootstrap 95% CI. A metric is a
strength when the CI lies above 0 and the standardised effect (diff / lobby SD) >= 0.25; a weakness
when mirrored; otherwise "в норме". Ratio metrics (entry success, clutch) use pooled counts with a
Wilson interval for the player vs the pooled lobby rate.
"""

import zlib
from collections.abc import Callable
from typing import Any

import numpy as np

from ..domain import PlayerDataset, PlayerMatchStats
from .stats_utils import bootstrap_mean_ci, r, wilson

MIN_MATCHES = 5
MIN_ATTEMPTS = 15
EFFECT = 0.25

Metric = Callable[[PlayerMatchStats, int], float | None]

PER_MATCH: list[tuple[str, str, Metric, bool, str]] = [
    ("rating", "Rating 1.0", lambda s, n: s.rating, True, "Общий вклад: убийства, выживание и мультикиллы."),
    ("kpr", "Убийства за раунд", lambda s, n: s.kills / n, True, "Огневая результативность."),
    ("adr", "ADR", lambda s, n: s.adr, True, "Средний урон за раунд."),
    (
        "survival",
        "Выживаемость",
        lambda s, n: 1 - s.deaths / n,
        True,
        "Доля раундов без смерти. Низкая — частые неразменянные смерти или слишком агрессивные позиции.",
    ),
    ("hs", "Headshot %", lambda s, n: s.hs_pct, True, "Точность прицеливания в голову."),
    ("apr", "Ассисты за раунд", lambda s, n: s.assists / n, True, "Командная игра и добивание."),
    (
        "entry_rate",
        "Попытки entry за раунд",
        lambda s, n: s.entry_count / n if s.entry_count is not None else None,
        True,
        "Как часто игрок участвует в первой дуэли раунда (роль, а не качество).",
    ),
    (
        "util_dmg",
        "Урон гранатами за раунд",
        lambda s, n: s.utility_damage / n if s.utility_damage is not None else None,
        True,
        "Эффективность HE/molotov.",
    ),
    (
        "flashed",
        "Ослеплённых врагов за раунд",
        lambda s, n: s.enemies_flashed / n if s.enemies_flashed is not None else None,
        True,
        "Качество флешек для команды.",
    ),
    (
        "multikill",
        "Раунды с мультикиллом",
        lambda s, n: (s.double_kills + s.triple_kills + s.quadro_kills + s.penta_kills) / n,
        True,
        "Способность выигрывать раунды в одиночку.",
    ),
]

POOLED: list[tuple[str, str, str, str, str]] = [
    ("entry_success", "Успешность entry", "entry_wins", "entry_count", "Доля выигранных первых дуэлей."),
    ("clutch_1v1", "Клатчи 1v1", "clutch_1v1_wins", "clutch_1v1_count", "Реализация ситуаций 1v1."),
    ("clutch_1v2", "Клатчи 1v2", "clutch_1v2_wins", "clutch_1v2_count", "Реализация ситуаций 1v2."),
]


def _classify(lo: float, hi: float, effect: float, higher_better: bool) -> str:
    if lo > 0 and effect >= EFFECT:
        return "strength" if higher_better else "weakness"
    if hi < 0 and effect <= -EFFECT:
        return "weakness" if higher_better else "strength"
    return "neutral"


def _confidence(n: int, medium: int, high: int) -> str:
    return "high" if n >= high else "medium" if n >= medium else "low"


def compute_insights(ds: PlayerDataset) -> dict[str, Any]:
    pid = ds.profile.player_id
    items: list[dict[str, Any]] = []
    usable = [pm for pm in ds.matches if pm.stats and pm.match.rounds]

    for key, label, fn, higher_better, desc in PER_MATCH:
        diffs, mine, lobby_all = [], [], []
        for pm in usable:
            n = pm.match.rounds or 1
            me = fn(pm.stats, n)
            others = [
                fn(p.stats, n)
                for t in pm.match.teams
                for p in t.players
                if p.player_id != pid and p.stats is not None
            ]
            others = [o for o in others if o is not None]
            if me is None or len(others) < 5:
                continue
            diffs.append(me - float(np.mean(others)))
            mine.append(me)
            lobby_all.extend(others)
        item: dict[str, Any] = {
            "key": key,
            "label": label,
            "description": desc,
            "n": len(diffs),
            "kind": "paired",
            "confidence": _confidence(len(diffs), 20, 60),
        }
        if len(diffs) < MIN_MATCHES:
            item.update(status="insufficient_data")
            items.append(item)
            continue
        d = np.array(diffs)
        lo, hi = bootstrap_mean_ci(d, seed=zlib.crc32(key.encode()))
        sd = float(np.std(lobby_all)) or 1.0
        effect = float(d.mean()) / sd
        pct = float((np.array(lobby_all) < np.mean(mine)).mean() * 100)
        item.update(
            status=_classify(lo, hi, effect, higher_better),
            player=r(np.mean(mine)),
            lobby=r(np.mean(lobby_all)),
            diff=r(d.mean()),
            ci=[r(lo), r(hi)],
            effect_size=r(effect),
            percentile=r(pct, 1),
        )
        items.append(item)

    for key, label, wins_f, cnt_f, desc in POOLED:
        pw = pc = lw = lc = 0
        for pm in usable:
            for t in pm.match.teams:
                for p in t.players:
                    s = p.stats
                    if s is None or getattr(s, cnt_f) is None:
                        continue
                    if p.player_id == pid:
                        pw, pc = pw + (getattr(s, wins_f) or 0), pc + getattr(s, cnt_f)
                    else:
                        lw, lc = lw + (getattr(s, wins_f) or 0), lc + getattr(s, cnt_f)
        item = {
            "key": key,
            "label": label,
            "description": desc,
            "n": pc,
            "kind": "pooled",
            "confidence": _confidence(pc, 40, 120),
        }
        if pc < MIN_ATTEMPTS or lc == 0:
            item.update(
                status="insufficient_data",
                player=r(pw / pc) if pc else None,
                lobby=r(lw / lc) if lc else None,
                attempts=pc,
            )
            items.append(item)
            continue
        lo, hi = wilson(pw, pc)
        lobby_rate = lw / lc
        status = "strength" if lo > lobby_rate else "weakness" if hi < lobby_rate else "neutral"
        item.update(
            status=status,
            player=r(pw / pc),
            lobby=r(lobby_rate),
            diff=r(pw / pc - lobby_rate),
            ci=[r(lo - lobby_rate), r(hi - lobby_rate)],
            attempts=pc,
        )
        items.append(item)

    summary = {s: [i["label"] for i in items if i["status"] == s] for s in ("strength", "weakness")}
    return {
        "items": items,
        "strengths": summary["strength"],
        "weaknesses": summary["weakness"],
        "matches_used": len(usable),
        "method": "Сравнение с другими 9 игроками тех же матчей (парная разница, bootstrap 95% CI). "
        f"Сильная/слабая сторона — если CI не пересекает 0 и эффект ≥ {EFFECT} SD лобби. "
        f"Минимум {MIN_MATCHES} матчей, для долей — {MIN_ATTEMPTS} попыток.",
    }
