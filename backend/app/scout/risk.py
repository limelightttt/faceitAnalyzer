"""Matchmaking Risk: explainable statistical-unusualness signals and cautious hypotheses.

This is NOT a cheat/smurf detector with known accuracy: there are no ground-truth labels, so a high score
means "statistically unusual", never "probably cheating". Each signal reports value, reference, data volume
and alternative explanations. A hypothesis needs >= 2 independent signals (boosting needs its own pattern),
and a minimum data volume — small samples are reported as "insufficient", never as suspicion.

Signals
* fast_climb      — Elo above the 1000 start reached in few CS2 matches: (elo-1000)/matches vs the
                    ~25 Elo per net win ceiling. Discounted for old accounts (CS:GO veterans carried Elo).
* new_account     — FACEIT account younger than 90 days at level >= 8.
* win_rate_excess — recent/lifetime win rate far above 50% (one-sided binomial test). Matchmaking aims at
                    even games, so sustained excess means the Elo has not caught up with the real level.
* lobby_outlier   — recent ADR and K/D both >= 2 SD above the other nine players.
* headshot_extreme— HS% >= 70 over >= 150 recent kills (only ever used together with other signals).
* below_level     — recent performance >= 2 SD below the lobby while Elo is in the top half (boosting pattern
                    only with a frequent, much stronger teammate).
"""

from typing import Any

import numpy as np
from scipy import stats as sps

from .features import PlayerFeatures

ALGO = "risk-v1"
START_ELO = 1000
ELO_PER_WIN = 25


def _signal(key, label, value, reference, strength, detail, n=None):
    return {
        "key": key,
        "label": label,
        "value": value,
        "reference": reference,
        "strength": round(strength, 2),
        "detail": detail,
        "n": n,
    }


def _lobby_z(p: PlayerFeatures, lobby: list[PlayerFeatures], key: str) -> tuple[float | None, float | None]:
    mine = p.recent_agg(20).get(key)
    others = [q.recent_agg(20).get(key) for q in lobby if q.player_id != p.player_id]
    others = [o for o in others if o is not None]
    if mine is None or len(others) < 5:
        return None, None
    sd = float(np.std(others)) or 1e-6
    return (mine - float(np.mean(others))) / sd, float(np.mean(others))


def player_risk(
    p: PlayerFeatures, lobby: list[PlayerFeatures], pairs: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    signals: list[dict[str, Any]] = []
    rec = p.recent_agg(20)
    age = p.account_age_days()
    data = {
        "lifetime_matches": p.lifetime_matches,
        "recent_matches": rec.get("n", 0),
        "account_age_days": round(age) if age is not None else None,
        "elo": p.elo,
        "level": p.level,
    }

    if p.elo and p.lifetime_matches and p.lifetime_matches > 0 and p.elo > START_ELO + 200:
        per_match = (p.elo - START_ELO) / p.lifetime_matches
        min_matches = (p.elo - START_ELO) / ELO_PER_WIN
        if per_match >= 6 and p.lifetime_matches < 400:
            strength = min(1.0, (per_match - 6) / 12 + 0.4)
            if age is not None and age > 365:
                strength *= 0.35  # likely CS:GO Elo carried into CS2
            signals.append(
                _signal(
                    "fast_climb",
                    "Быстрый рост Elo",
                    round(per_match, 1),
                    "≤ 3–5 Elo/матч у типичных аккаунтов",
                    strength,
                    f"{p.elo} Elo за {p.lifetime_matches} матчей CS2 (минимум ~{min_matches:.0f} побед подряд "
                    f"от стартовых {START_ELO})",
                    p.lifetime_matches,
                )
            )
    if age is not None and age < 90 and (p.level or 0) >= 8:
        signals.append(
            _signal(
                "new_account",
                "Новый аккаунт на высоком уровне",
                round(age),
                "< 90 дней при уровне ≥ 8",
                0.8 if age < 45 else 0.6,
                f"аккаунту FACEIT {age:.0f} дн., уровень {p.level}",
            )
        )
    n, wins = rec.get("n", 0), rec.get("wins", 0)
    if n >= 15:
        pval = float(sps.binomtest(wins, n, 0.5, alternative="greater").pvalue)
        wr = wins / n
        if pval < 0.01 and wr >= 0.68:
            signals.append(
                _signal(
                    "win_rate_excess",
                    "Аномально высокий win rate",
                    round(wr, 2),
                    "≈ 50% (цель матчмейкинга)",
                    min(1.0, 0.5 + (0.01 - pval) * 50 + (wr - 0.68)),
                    f"{wins} побед из {n} (p = {pval:.4f})",
                    n,
                )
            )
    elif p.lifetime_matches and p.lifetime_win_rate and p.lifetime_matches >= 30:
        w = round(p.lifetime_win_rate * p.lifetime_matches)
        pval = float(sps.binomtest(w, p.lifetime_matches, 0.5, alternative="greater").pvalue)
        if pval < 0.01 and p.lifetime_win_rate >= 0.68:
            signals.append(
                _signal(
                    "win_rate_excess",
                    "Аномально высокий win rate",
                    round(p.lifetime_win_rate, 2),
                    "≈ 50%",
                    0.6,
                    f"{p.lifetime_win_rate:.0%} за {p.lifetime_matches} матчей (p = {pval:.4f})",
                    p.lifetime_matches,
                )
            )
    z_adr, m_adr = _lobby_z(p, lobby, "adr")
    z_kd, m_kd = _lobby_z(p, lobby, "kd")
    if z_adr is not None and z_kd is not None and n >= 10:
        if z_adr >= 2 and z_kd >= 2:
            signals.append(
                _signal(
                    "lobby_outlier",
                    "Сильно выше уровня лобби",
                    {"adr": round(rec["adr"], 1), "kd": round(rec["kd"], 2)},
                    {"adr": round(m_adr, 1), "kd": round(m_kd, 2)},
                    min(1.0, (min(z_adr, z_kd) - 2) / 2 + 0.5),
                    f"ADR +{z_adr:.1f} SD, K/D +{z_kd:.1f} SD относительно остальных 9 игроков",
                    n,
                )
            )
        elif z_adr <= -2 and z_kd <= -2:
            elos = sorted(q.elo for q in lobby if q.elo)
            if p.elo and elos and p.elo >= np.median(elos):
                strong_mate = None
                for pr in pairs or []:
                    if p.player_id in (pr["a"], pr["b"]) and pr["category"] in (
                        "possible_duo",
                        "established_cooperation",
                    ):
                        other = pr["b"] if pr["a"] == p.player_id else pr["a"]
                        q = next((x for x in lobby if x.player_id == other), None)
                        if q and (q.recent_agg(20).get("rating") or 0) - (rec.get("rating") or 0) >= 0.35:
                            strong_mate = q.nickname
                if strong_mate:
                    signals.append(
                        _signal(
                            "below_level",
                            "Игра заметно ниже своего Elo при сильном напарнике",
                            {"adr": round(rec["adr"], 1), "kd": round(rec["kd"], 2)},
                            {"adr": round(m_adr, 1), "kd": round(m_kd, 2)},
                            0.7,
                            f"ADR {z_adr:.1f} SD, K/D {z_kd:.1f} SD; часто в одной команде с {strong_mate}",
                            n,
                        )
                    )
    if (rec.get("hs") or 0) >= 70 and rec.get("kills", 0) >= 150:
        signals.append(
            _signal(
                "headshot_extreme",
                "Экстремальный процент хедшотов",
                round(rec["hs"], 1),
                "обычно 40–60%",
                0.4,
                f"{rec['hs']:.0f}% HS на {rec['kills']} убийствах",
                rec.get("kills"),
            )
        )

    keys = {s["key"] for s in signals}
    score = round(sum(s["strength"] for s in signals), 2)
    classification = None
    if "below_level" in keys:
        classification = "possible_boosting"
    elif len(keys - {"headshot_extreme"}) >= 2 and score >= 1.4:
        if "headshot_extreme" in keys and "lobby_outlier" in keys:
            classification = "unfair_play_indicators"
        elif keys & {"new_account", "fast_climb"} and keys & {"lobby_outlier", "win_rate_excess"}:
            classification = "new_account_high_performance" if "new_account" in keys else "possible_smurf"
        elif "lobby_outlier" in keys and "win_rate_excess" in keys:
            classification = "possible_smurf"
        else:
            classification = "highly_atypical"
    insufficient = (rec.get("n", 0) < 10 and not p.lifetime_matches) or bool(p.errors)
    return {
        "player_id": p.player_id,
        "nickname": p.nickname,
        "signals": signals,
        "score": score,
        "classification": classification,
        "label": LABELS.get(classification),
        "confidence": None if not classification else ("medium" if score >= 2.2 else "low"),
        "data": data,
        "insufficient_data": insufficient,
        "alternatives": ALTERNATIVES.get(classification, []),
        "disclaimer": "Статистическая необычность, а не установленный факт. Меток нарушений нет, точность модели "
        "как детектора не измерена.",
    }


LABELS = {
    "possible_smurf": "Возможный smurf-подобный профиль",
    "possible_boosting": "Возможный паттерн, связанный с бустингом",
    "new_account_high_performance": "Необычно сильный новый аккаунт",
    "unfair_play_indicators": "Возможные индикаторы нечестной игры (не проверено)",
    "highly_atypical": "Крайне нетипичный профиль для лобби",
}

ALTERNATIVES = {
    "possible_smurf": [
        "Опытный игрок после долгого перерыва / новый аккаунт после смены региона",
        "Сильная серия, которая ещё не отразилась в Elo",
        "Игрок недавно перешёл с другой платформы",
    ],
    "possible_boosting": [
        "Плохая форма или непривычная роль",
        "Игра с другом выше своего уровня ради компании",
    ],
    "new_account_high_performance": [
        "Переход с Premier/другой платформы с реальным высоким уровнем",
        "Второй аккаунт после блокировки — неизвестно; статистика этого не различает",
    ],
    "unfair_play_indicators": [
        "Выдающаяся механика/AWP-роль",
        "Малая выборка удачных матчей",
        "Сильные игроки действительно существуют — статистика не доказывает нарушение",
    ],
    "highly_atypical": ["Небольшая выборка", "Роль игрока сильно отличается от остальных"],
}


def team_instability(team: list[PlayerFeatures], pairs: list[dict[str, Any]]) -> dict[str, Any]:
    signals = []
    elos = [p.elo for p in team if p.elo]
    if len(elos) >= 4:
        spread = max(elos) - min(elos)
        if spread >= 700:
            signals.append(
                {
                    "key": "elo_spread",
                    "text": f"Сильно неравномерный уровень: разброс {spread} Elo",
                    "evidence": "fact",
                }
            )
    poor = [
        p.nickname
        for p in team
        if p.recent_agg(20).get("n", 0) >= 10 and (p.recent_agg(20).get("win_rate") or 1) <= 0.3
    ]
    if len(poor) >= 2:
        signals.append(
            {
                "key": "poor_form",
                "text": f"Низкая недавняя доля побед у {len(poor)} игроков: {', '.join(poor)}",
                "evidence": "fact",
            }
        )
    newbies = [p.nickname for p in team if p.lifetime_matches is not None and p.lifetime_matches < 40]
    if newbies:
        signals.append(
            {
                "key": "inexperienced",
                "text": f"Мало матчей CS2 на FACEIT: {', '.join(newbies)}",
                "evidence": "fact",
            }
        )
    linked = any(pr["category"] != "insufficient_evidence" for pr in pairs)
    if not linked and len(team) == 5:
        signals.append(
            {
                "key": "no_shared_history",
                "text": "В последних матчах игроки не встречались вместе — сыгранность неизвестна",
                "evidence": "fact",
            }
        )
    vols = [p.recent_agg(20).get("rating_sd") for p in team]
    vols = [v for v in vols if v is not None]
    if vols and float(np.mean(vols)) >= 0.45:
        signals.append(
            {
                "key": "volatile",
                "text": f"Нестабильная игра: средний разброс Rating {np.mean(vols):.2f}",
                "evidence": "estimate",
            }
        )
    weight = sum(1 for s in signals if s["key"] in ("elo_spread", "poor_form", "volatile")) + 0.5 * sum(
        1 for s in signals if s["key"] in ("inexperienced", "no_shared_history")
    )
    level = (
        "insufficient_data"
        if len(elos) < 4
        else "elevated"
        if weight >= 2
        else "moderate"
        if weight >= 1
        else "low"
    )
    return {
        "level": level,
        "signals": signals,
        "note": "Оценивается только по статистике. Поведенческих данных (чат, жалобы) нет — о конфликтах "
        "в команде выводов не делается.",
    }
