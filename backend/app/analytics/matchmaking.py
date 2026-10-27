"""Matchmaking research: transparent hypothesis tests instead of a "hidden pool score".

The popular "hidden pool" claim implies observable consequences. We test each with a standard,
documented method and correct for multiple testing (Benjamini-Hochberg, FDR 10%). A significant result
is reported as an *anomaly consistent with* several explanations, never as proof of a hidden pool.
Status "anomaly" additionally requires a practically relevant effect size (e.g. >= 15 Elo team gap,
|rho| >= 0.1, >= 3 pp win-rate deviation); significant-but-negligible effects are "weak_signal".
"""

import math
from collections import defaultdict
from typing import Any

import numpy as np
from scipy import stats as sps

from ..domain import PlayerDataset, PlayerMatch
from .stats_utils import benjamini_hochberg, r, wilson

FDR = 0.10
PERMUTATIONS = 4000


def _chrono(ds: PlayerDataset) -> list[PlayerMatch]:
    return [pm for pm in reversed(ds.matches) if pm.won is not None]


def _result(
    tid: str, title: str, question: str, method: str, n: int, min_n: int, alternatives: list[str]
) -> dict[str, Any]:
    return {
        "id": tid,
        "title": title,
        "question": question,
        "method": method,
        "n": n,
        "min_n": min_n,
        "alternatives": alternatives,
        "status": "insufficient_data" if n < min_n else "pending",
        "p_value": None,
        "q_value": None,
        "statistic": None,
        "effect": None,
        "chart": None,
        "practical": True,
    }


def _perm_spearman(x: np.ndarray, y: np.ndarray, seed: int) -> tuple[float, float]:
    rx, ry = sps.rankdata(x), sps.rankdata(y)
    rx, ry = rx - rx.mean(), ry - ry.mean()
    denom = math.sqrt(float((rx * rx).sum() * (ry * ry).sum()))
    if denom == 0:
        return 0.0, 1.0
    rho = float((rx * ry).sum() / denom)
    rng = np.random.default_rng(seed)
    perms = rng.permuted(np.tile(ry, (PERMUTATIONS, 1)), axis=1)
    null = (perms @ rx) / denom
    return rho, float((np.sum(np.abs(null) >= abs(rho) - 1e-12) + 1) / (PERMUTATIONS + 1))


def _streaks_before(seq: list[bool]) -> list[int]:
    out, s = [], 0
    for w in seq:
        out.append(s)
        s = (max(s, 0) + 1) if w else (min(s, 0) - 1)
    return out


def test_calibration(ms: list[PlayerMatch]) -> dict[str, Any]:
    sub = [pm for pm in ms if pm.win_probability is not None]
    t = _result(
        "calibration",
        "Победы vs ожидание по Elo",
        "Выигрывает ли игрок реже/чаще, чем предсказывает FACEIT по Elo команд?",
        "Сумма предматчевых вероятностей победы против фактических побед; z-тест для "
        "Poisson-binomial распределения; калибровочные бины.",
        len(sub),
        20,
        [
            "Игрок недооценён/переоценён системой (Elo ещё догоняет навык)",
            "Игра в пати с сильными/слабыми друзьями",
            "Случайная вариация на малой выборке",
        ],
    )
    if t["status"] == "insufficient_data":
        return t
    p = np.array([pm.win_probability for pm in sub])
    w = np.array([1.0 if pm.won else 0.0 for pm in sub])
    var = float((p * (1 - p)).sum())
    z = (w.sum() - p.sum()) / math.sqrt(var) if var > 0 else 0.0
    pval = 2 * (1 - sps.norm.cdf(abs(z)))
    bins = []
    for lo in np.arange(0.3, 0.71, 0.1):
        mask = (p >= lo) & (p < lo + 0.1)
        if mask.sum():
            bins.append(
                {
                    "bin": f"{int(lo * 100)}–{int(lo * 100 + 10)}%",
                    "expected": r(p[mask].mean()),
                    "observed": r(w[mask].mean()),
                    "n": int(mask.sum()),
                }
            )
    t.update(
        statistic=r(z),
        p_value=r(pval, 4),
        effect=f"{int(w.sum())} побед при ожидании {p.sum():.1f}",
        practical=bool(abs(w.sum() - p.sum()) / len(sub) >= 0.03),
        chart={"type": "calibration", "bins": bins},
    )
    return t


def test_runs(ms: list[PlayerMatch]) -> dict[str, Any]:
    seq = [bool(pm.won) for pm in ms]
    t = _result(
        "streaks",
        "Серии побед/поражений",
        "Группируются ли результаты в серии сильнее, чем при независимых матчах?",
        "Wald–Wolfowitz runs test по последовательности W/L + сравнение P(W|W) и P(W|L) (точный тест Фишера).",
        len(seq),
        20,
        [
            "Тильт/усталость и «разогрев» влияют на игру",
            "Игра сессиями с разными тиммейтами",
            "Изменение формы игрока со временем",
        ],
    )
    if t["status"] == "insufficient_data":
        return t
    n1, n2 = sum(seq), len(seq) - sum(seq)
    runs = 1 + sum(1 for a, b in zip(seq, seq[1:], strict=False) if a != b)
    if n1 == 0 or n2 == 0:
        t.update(status="insufficient_data")
        return t
    mu = 2 * n1 * n2 / (n1 + n2) + 1
    var = (mu - 1) * (mu - 2) / (n1 + n2 - 1)
    z = (runs - mu) / math.sqrt(var) if var > 0 else 0.0
    pval = 2 * (1 - sps.norm.cdf(abs(z)))
    ww = sum(1 for a, b in zip(seq, seq[1:], strict=False) if a and b)
    wl = sum(1 for a, b in zip(seq, seq[1:], strict=False) if a and not b)
    lw = sum(1 for a, b in zip(seq, seq[1:], strict=False) if not a and b)
    ll = sum(1 for a, b in zip(seq, seq[1:], strict=False) if not a and not b)
    p_fisher = float(sps.fisher_exact([[ww, wl], [lw, ll]]).pvalue)
    t.update(
        statistic=r(z),
        p_value=r(min(1.0, min(pval, p_fisher) * 2), 4),  # Bonferroni across the 2 views
        effect=f"серий: {runs} при ожидании {mu:.1f}; P(W|W)={ww / max(ww + wl, 1):.2f}, "
        f"P(W|L)={lw / max(lw + ll, 1):.2f}",
        chart={"type": "sequence", "sequence": ["W" if w else "L" for w in seq]},
    )
    return t


def test_streak_opponents(ms: list[PlayerMatch]) -> dict[str, Any]:
    sub_idx = [i for i, pm in enumerate(ms) if pm.team_avg_elo is not None and pm.opp_avg_elo is not None]
    t = _result(
        "streak_opponents",
        "Соперники после серий",
        "Становятся ли соперники сильнее (по Elo) после серии побед — ключевое следствие гипотезы «пула»?",
        "Спирмен между длиной предшествующей серии (+побед/−поражений) и разницей Elo (соперники − своя "
        "команда); p-value перестановочным тестом.",
        len(sub_idx),
        25,
        [
            "После побед растёт собственный Elo → выше и соперники, и тиммейты (эффект уровня)",
            "Время суток/размер онлайна меняет состав очереди",
            "Пати-очередь с более сильными друзьями",
        ],
    )
    if t["status"] == "insufficient_data":
        return t
    streaks = _streaks_before([bool(pm.won) for pm in ms])
    x = np.array([streaks[i] for i in sub_idx], dtype=float)
    y = np.array([ms[i].opp_avg_elo - ms[i].team_avg_elo for i in sub_idx], dtype=float)
    rho, pval = _perm_spearman(x, y, seed=11)
    buckets = defaultdict(list)
    for s, g in zip(x, y, strict=True):
        key = "≤−3" if s <= -3 else "−2…−1" if s < 0 else "0" if s == 0 else "1…2" if s <= 2 else "≥3"
        buckets[key].append(g)
    order = ["≤−3", "−2…−1", "0", "1…2", "≥3"]
    t.update(
        statistic=r(rho),
        p_value=r(pval, 4),
        effect=f"ρ = {rho:.2f}",
        practical=abs(rho) >= 0.1,
        chart={
            "type": "bars",
            "x_label": "Серия перед матчем",
            "y_label": "Elo соперников − Elo своей команды",
            "bars": [
                {"label": k, "value": r(float(np.mean(buckets[k])), 1), "n": len(buckets[k])}
                for k in order
                if buckets[k]
            ],
        },
    )
    return t


def test_streak_residual(ms: list[PlayerMatch]) -> dict[str, Any]:
    sub_idx = [i for i, pm in enumerate(ms) if pm.win_probability is not None]
    t = _result(
        "streak_residual",
        "Результат после серий vs ожидание",
        "Проигрывает ли игрок после серии побед чаще, чем предсказывает Elo (скрытое «выравнивание»)?",
        "Спирмен между предшествующей серией и остатком (исход − вероятность победы); перестановочный тест.",
        len(sub_idx),
        30,
        [
            "Тильт или усталость после длинной сессии",
            "Регрессия к среднему: серии частично случайны",
            "Скрытые параметры качества тиммейтов",
        ],
    )
    if t["status"] == "insufficient_data":
        return t
    streaks = _streaks_before([bool(pm.won) for pm in ms])
    x = np.array([streaks[i] for i in sub_idx], dtype=float)
    y = np.array([(1.0 if ms[i].won else 0.0) - ms[i].win_probability for i in sub_idx])
    rho, pval = _perm_spearman(x, y, seed=12)
    t.update(statistic=r(rho), p_value=r(pval, 4), effect=f"ρ = {rho:.2f}", practical=abs(rho) >= 0.1)
    return t


def test_party(ms: list[PlayerMatch]) -> dict[str, Any]:
    solo = [pm for pm in ms if pm.party_size == 1]
    party = [pm for pm in ms if pm.party_size > 1]
    t = _result(
        "party",
        "Пати vs соло",
        "Отличается ли результат в пати и соло (с учётом ожидания по Elo)?",
        "Точный тест Фишера по победам; если есть вероятности — также остаток (исход − ожидание). Пати "
        "определяется эвристически по повторяющимся тиммейтам.",
        min(len(solo), len(party)),
        10,
        [
            "Коммуникация и роли в пати",
            "Пати чаще играет в определённое время/на определённых картах",
            "Эвристика пати может ошибаться",
        ],
    )
    if t["status"] == "insufficient_data":
        t["effect"] = f"соло: {len(solo)}, пати: {len(party)}"
        return t
    sw, pw = sum(1 for pm in solo if pm.won), sum(1 for pm in party if pm.won)
    pval = float(sps.fisher_exact([[sw, len(solo) - sw], [pw, len(party) - pw]]).pvalue)
    bars = []
    for label, grp, w in (("Соло", solo, sw), ("Пати", party, pw)):
        lo, hi = wilson(w, len(grp))
        exp = [pm.win_probability for pm in grp if pm.win_probability is not None]
        bars.append(
            {
                "label": label,
                "value": r(w / len(grp)),
                "ci": [r(lo), r(hi)],
                "n": len(grp),
                "expected": r(float(np.mean(exp))) if exp else None,
            }
        )
    t.update(
        p_value=r(pval, 4),
        effect=f"WR соло {sw / len(solo):.0%} vs пати {pw / len(party):.0%}",
        chart={"type": "winrate", "bars": bars},
    )
    return t


def test_team_balance(ms: list[PlayerMatch]) -> dict[str, Any]:
    """Under Elo-balanced matchmaking the player's team (including the player) should not be systematically
    weaker. Comparing teammates *without* the player to opponents would be biased: balancing correctly
    compensates for the player's own rating, so the full-team comparison is the right null."""
    diffs, unit = [], "Elo"
    if sum(1 for pm in ms if pm.team_avg_elo is not None and pm.opp_avg_elo is not None) >= 20:
        diffs = [
            pm.team_avg_elo - pm.opp_avg_elo
            for pm in ms
            if pm.team_avg_elo is not None and pm.opp_avg_elo is not None
        ]
    else:
        unit = "уровня"
        for pm in ms:
            team, opp = pm.match.teams[pm.team_index], pm.match.teams[1 - pm.team_index]
            a = [p.skill_level for p in team.players if p.skill_level]
            b = [p.skill_level for p in opp.players if p.skill_level]
            if len(a) >= 4 and len(b) >= 4:
                diffs.append(float(np.mean(a) - np.mean(b)))
    t = _result(
        "team_balance",
        "Баланс команд",
        "Оказывается ли команда игрока (вместе с ним) систематически слабее соперников?",
        f"Wilcoxon signed-rank для разницы среднего {'Elo' if unit == 'Elo' else 'уровня FACEIT'} своей "
        "команды и соперников (нулевая гипотеза: медиана разницы 0).",
        len(diffs),
        20,
        [
            "Пати-очередь: FACEIT балансирует составы с премейдами иначе",
            "Ограниченный онлайн на высоком Elo/в позднее время",
            "Уровни — грубые интервалы Elo",
        ],
    )
    if t["status"] == "insufficient_data":
        return t
    d = np.array(diffs, dtype=float)
    pval = float(sps.wilcoxon(d).pvalue) if np.any(d != 0) else 1.0
    t.update(
        statistic=r(float(d.mean())),
        p_value=r(pval, 4),
        practical=bool(abs(d.mean()) >= (15 if unit == "Elo" else 0.15)),  # ~2% win probability
        effect=f"в среднем своя команда {d.mean():+.{0 if unit == 'Elo' else 2}f} {unit} относительно соперников",
        chart={"type": "histogram", "unit": unit, "values": [r(v, 2) for v in d]},
    )
    return t


def _chi_factor(
    ms: list[PlayerMatch],
    tid: str,
    title: str,
    key_fn,
    min_group: int,
    alternatives: list[str],
    question: str,
) -> dict[str, Any]:
    groups: dict[str, list[bool]] = defaultdict(list)
    for pm in ms:
        k = key_fn(pm)
        if k is not None:
            groups[k].append(bool(pm.won))
    big = {k: v for k, v in groups.items() if len(v) >= min_group}
    t = _result(
        tid,
        title,
        question,
        f"χ² тест независимости исхода от фактора (группы ≥ {min_group} матчей), доли побед с 95% Wilson CI.",
        sum(len(v) for v in big.values()),
        30,
        alternatives,
    )
    if len(big) < 2:
        t["status"] = "insufficient_data"
    bars = []
    for k, v in sorted(big.items()):
        lo, hi = wilson(sum(v), len(v))
        bars.append({"label": k, "value": r(sum(v) / len(v)), "ci": [r(lo), r(hi)], "n": len(v)})
    t["chart"] = {"type": "winrate", "bars": bars}
    if t["status"] == "insufficient_data":
        return t
    table = np.array([[sum(v), len(v) - sum(v)] for v in big.values()])
    if (table.sum(axis=0) == 0).any():
        t.update(status="insufficient_data")
        return t
    chi = sps.chi2_contingency(table)
    t.update(statistic=r(float(chi.statistic)), p_value=r(float(chi.pvalue), 4))
    return t


def _hour_bucket(pm: PlayerMatch) -> str | None:
    if not pm.match.started_at:
        return None
    h = pm.match.started_at.hour
    return "00–06" if h < 6 else "06–12" if h < 12 else "12–18" if h < 18 else "18–24"


def analyze(ds: PlayerDataset) -> dict[str, Any]:
    ms = _chrono(ds)
    tests = [
        test_calibration(ms),
        test_runs(ms),
        test_streak_opponents(ms),
        test_streak_residual(ms),
        test_party(ms),
        test_team_balance(ms),
        _chi_factor(
            ms,
            "maps",
            "Карты",
            lambda pm: pm.match.map,
            5,
            ["Разный уровень владения картами (ожидаемо)", "Мало матчей на редких картах"],
            "Зависит ли результат от карты?",
        ),
        _chi_factor(
            ms,
            "time",
            "Время суток (UTC)",
            _hour_bucket,
            8,
            ["Усталость поздно вечером", "Разный состав онлайна в разное время"],
            "Зависит ли результат от времени начала матча?",
        ),
    ]
    tested = [t for t in tests if t["p_value"] is not None]
    for t, q in zip(tested, benjamini_hochberg([t["p_value"] for t in tested]), strict=True):
        t["q_value"] = r(q, 4)
        if q < FDR and t["practical"]:
            t["status"] = "anomaly"
        elif q < FDR or t["p_value"] < 0.05:
            t["status"] = "weak_signal"  # nominally significant or practically negligible effect
        else:
            t["status"] = "no_anomaly"
    for t in tests:
        if t["status"] == "pending":
            t["status"] = "no_anomaly"
    anomalies = [t["title"] for t in tests if t["status"] == "anomaly"]
    hp_tests = {"streak_opponents", "streak_residual", "calibration"}
    hp_ran = [t for t in tests if t["id"] in hp_tests and t["status"] != "insufficient_data"]
    if not hp_ran:
        verdict, confidence = "insufficient_data", "none"
        text = (
            "Недостаточно данных для проверки гипотезы: нужны предматчевые вероятности/Elo команд и ≥ 20–30 "
            "матчей. Сейчас вывод сделать нельзя."
        )
    elif any(t["status"] == "anomaly" for t in hp_ran):
        verdict, confidence = "anomaly", "low" if len(ms) < 80 else "medium"
        text = (
            "Найдена статистически значимая аномалия в тестах, связанных с гипотезой «скрытого пула». Это "
            "согласуется с гипотезой, но так же хорошо объясняется альтернативами (см. каждый тест). "
            "Это не доказательство существования скрытого пула."
        )
    else:
        verdict, confidence = "no_evidence", "low" if len(ms) < 80 else "medium"
        text = (
            "Данные не показывают аномалий, которых требовала бы гипотеза «скрытого пула» "
            "(после поправки на множественные сравнения). Отсутствие эффекта на этой выборке не доказывает "
            "его отсутствие в принципе: малые эффекты требуют сотен матчей."
        )
    return {
        "matches": len(ms),
        "tests": tests,
        "anomalies": anomalies,
        "verdict": {"code": verdict, "confidence": confidence, "text": text},
        "method": __doc__,
        "fdr": FDR,
    }
