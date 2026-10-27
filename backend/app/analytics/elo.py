"""Elo: official value, reconstructed history and research forecasts.

Everything except `official` is an ESTIMATE and is labelled as such in the API/UI.

* Reconstruction: FACEIT does not expose per-match Elo in the Data API. Starting from the current official
  Elo we walk history backwards using the standard Elo update delta = K * (outcome - p), K = 50, where p is
  FACEIT's own pre-match `winProbability` (or the Elo expectation from team averages). For an even match
  this gives the familiar ±25. Error accumulates with distance from the present.
* Projection: Monte Carlo over the next N matches; per-simulation win rate drawn from a Beta posterior
  (prior Beta(10, 10) centred on 50% — matchmaking aims at even games — updated with the last 30 results).
* Performance-implied Elo ("точка стабилизации"): lobby players' Rating 1.0 is regressed on their Elo
  (FACEIT level midpoints relative to lobby average) within matches to get the rating-per-Elo slope; the
  player's average rating surplus over the lobby is converted into Elo above the lobby average. This is
  where Elo would tend to settle if current performance persists; it is not the official rating.
  Requires variation of skill levels inside lobbies; otherwise it reports itself as unreliable.
* Results-implied Elo: a chess-style performance rating adapted to 5v5 — the individual Elo at which the
  observed number of wins equals the Elo expectation (the player's share of the team average is 1/5).
  Bootstrap over matches gives an 80% interval. Wide intervals are expected: one player is 20% of a team.
"""

from typing import Any

import numpy as np

from ..domain import PlayerDataset
from .stats_utils import r

METHOD_RU = """Всё, кроме официального Elo, — оценки, а не рейтинг FACEIT.

• Реконструкция: Data API не отдаёт Elo за каждый матч. Идём назад от текущего официального Elo по правилу
  Elo: Δ = K·(исход − p), K = 50, p — предматчевая вероятность победы FACEIT (или ожидание по среднему Elo
  команд). Для равного матча это привычные ±25. Ошибка растёт по мере удаления от текущего момента.
• Прогноз: Monte Carlo на N матчей вперёд. Доля побед в каждой симуляции берётся из бета-апостериорного
  распределения (априорное Beta(10,10) вокруг 50% — матчмейкинг стремится к равным играм — плюс последние
  30 результатов). Показаны медиана и 80% интервал.
• Elo по результатам: «перформанс-рейтинг» как в шахматах, адаптированный к 5v5 — индивидуальный Elo, при
  котором ожидаемое число побед равно фактическому (вклад игрока в среднее команды — 1/5). Интервал — bootstrap
  по матчам; широкий интервал ожидаем: один игрок — 20% команды.
• Elo по игре: рейтинг игроков лобби регрессируется на их Elo (середины диапазонов уровней) внутри матчей;
  превышение рейтинга игрока над лобби переводится в Elo. Это точка, к которой Elo будет стремиться при
  сохранении текущей игры. Требует разброса уровней в лобби, иначе помечается как ненадёжная."""

K = 50
LEVEL_MID = {1: 400, 2: 625, 3: 825, 4: 975, 5: 1125, 6: 1275, 7: 1440, 8: 1640, 9: 1875}
MIN_IMPLIED = 15


def _p(pm) -> float:
    return pm.win_probability if pm.win_probability is not None else 0.5


def reconstruct(ds: PlayerDataset) -> list[dict[str, Any]]:
    if ds.profile.elo is None:
        return []
    elo = float(ds.profile.elo)
    out = []
    for i, pm in enumerate(ds.matches):  # newest first
        if pm.won is None or pm.match.calculate_elo is False:
            continue
        delta = K * ((1.0 if pm.won else 0.0) - _p(pm))
        out.append(
            {
                "match_id": pm.match.match_id,
                "started_at": pm.match.started_at.isoformat() if pm.match.started_at else None,
                "elo_after": round(elo),
                "delta": round(delta),
                "won": pm.won,
                "distance": i,
            }
        )
        elo -= delta
    out.reverse()
    return out


def project(ds: PlayerDataset, horizon: int = 30, sims: int = 4000, seed: int = 1) -> dict[str, Any] | None:
    recent = [pm for pm in ds.matches if pm.won is not None][:30]
    if len(recent) < 10:
        return None
    wins = sum(1 for pm in recent if pm.won)
    a, b = 10 + wins, 10 + len(recent) - wins
    rng = np.random.default_rng(seed)
    p = rng.beta(a, b, size=sims)
    outcomes = rng.random((sims, horizon)) < p[:, None]
    # matchmaking targets even games; pre-match win probability varies a little around 0.5
    p_match = np.clip(rng.normal(0.5, 0.05, size=(sims, horizon)), 0.3, 0.7)
    deltas = K * (outcomes.astype(float) - p_match)
    paths = np.cumsum(deltas, axis=1)
    start = float(ds.profile.elo) if ds.profile.elo is not None else 0.0
    qs = np.percentile(paths, [10, 50, 90], axis=0) + start
    return {
        "start": start if ds.profile.elo is not None else None,
        "relative": ds.profile.elo is None,
        "posterior_win_rate": r(a / (a + b)),
        "recent_n": len(recent),
        "recent_wins": wins,
        "series": [
            {"step": i + 1, "p10": round(qs[0][i]), "p50": round(qs[1][i]), "p90": round(qs[2][i])}
            for i in range(horizon)
        ],
    }


def performance_implied(ds: PlayerDataset) -> dict[str, Any]:
    pid = ds.profile.player_id
    xs, ys = [], []  # lobby: elo relative to lobby mean -> rating relative to lobby mean
    surplus, lobby_elos = [], []
    for pm in ds.matches:
        m = pm.match
        if not pm.stats or pm.team_avg_elo is None or pm.opp_avg_elo is None:
            continue
        lobby = [p for t in m.teams for p in t.players if p.stats and p.player_id != pid]
        with_level = [p for p in lobby if p.skill_level and p.skill_level < 10]
        if len(with_level) >= 6:
            elos = np.array([LEVEL_MID[p.skill_level] for p in with_level], dtype=float)
            rts = np.array([p.stats.rating for p in with_level])
            xs.extend(elos - elos.mean())
            ys.extend(rts - rts.mean())
        lobby_mean_rating = float(np.mean([p.stats.rating for p in lobby])) if lobby else 1.0
        surplus.append(pm.stats.rating - lobby_mean_rating)
        lobby_elos.append((pm.team_avg_elo + pm.opp_avg_elo) / 2)
    res: dict[str, Any] = {"n_matches": len(surplus), "n_lobby_points": len(xs), "available": False}
    if len(surplus) < MIN_IMPLIED:
        res["reason"] = f"Нужно ≥ {MIN_IMPLIED} матчей со средним Elo команд; есть {len(surplus)}."
        return res
    if len(xs) < 50:
        res["reason"] = (
            "В лобби почти все игроки 10 уровня: уровень FACEIT не задаёт Elo точнее, чем «2001+», "
            "поэтому связь рейтинга с Elo оценить нельзя."
        )
        return res
    x, y = np.array(xs), np.array(ys)
    slope = float((x * y).sum() / (x * x).sum())  # rating per Elo point (within-match, no intercept)
    resid = y - slope * x
    se = float(np.sqrt(resid.var() / (x * x).sum()))
    if slope - 2 * se <= 0:
        res["reason"] = "Связь рейтинга и Elo в лобби статистически не выявлена — оценка была бы ненадёжной."
        res["slope"] = r(slope, 6)
        return res
    s = np.array(surplus)
    base = float(np.mean(lobby_elos))
    rng = np.random.default_rng(3)
    boots = []
    for _ in range(2000):
        idx = rng.integers(0, len(s), len(s))
        sl = rng.normal(slope, se)
        boots.append(base + s[idx].mean() / max(sl, 1e-6))
    est = base + s.mean() / slope
    res.update(
        available=True,
        estimate=round(est),
        ci80=[round(np.percentile(boots, 10)), round(np.percentile(boots, 90))],
        lobby_avg_elo=round(base),
        rating_surplus=r(s.mean()),
        slope_per_100=r(slope * 100, 4),
        official=ds.profile.elo,
    )
    return res


def _solve_results_elo(rows: list[tuple[float, float, float, float]]) -> float:
    """rows: (team_avg, opp_avg, player_elo_before, outcome). Find E so that expected wins == actual wins,
    replacing the player's contribution to the team average by E (team of five)."""
    target = sum(o for *_, o in rows)

    def expected(e: float) -> float:
        return sum(1 / (1 + 10 ** ((opp - (team + (e - pe) / 5)) / 400)) for team, opp, pe, _ in rows)

    lo, hi = -2000.0, 6000.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if expected(mid) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def results_implied(ds: PlayerDataset, recon: list[dict[str, Any]]) -> dict[str, Any]:
    """Chess-style performance rating adapted to 5v5: the individual Elo at which the observed number of
    wins equals the Elo expectation. Uses reconstructed pre-match Elo of the player."""
    before = {x["match_id"]: x["elo_after"] - x["delta"] for x in recon}
    rows = [
        (pm.team_avg_elo, pm.opp_avg_elo, before[pm.match.match_id], 1.0 if pm.won else 0.0)
        for pm in ds.matches
        if pm.match.match_id in before and pm.team_avg_elo is not None and pm.opp_avg_elo is not None
    ]
    res: dict[str, Any] = {"n_matches": len(rows), "available": False}
    wins = sum(r_[3] for r_ in rows)
    if len(rows) < 30 or wins in (0, len(rows)):
        res["reason"] = f"Нужно ≥ 30 матчей с Elo команд и известным текущим Elo; есть {len(rows)}."
        return res
    est = _solve_results_elo(rows)
    rng = np.random.default_rng(5)
    boots = []
    for _ in range(300):
        sample = [rows[i] for i in rng.integers(0, len(rows), len(rows))]
        if 0 < sum(x[3] for x in sample) < len(sample):
            boots.append(_solve_results_elo(sample))
    res.update(
        available=True,
        estimate=round(est),
        ci80=[round(np.percentile(boots, 10)), round(np.percentile(boots, 90))],
        wins=int(wins),
        official=ds.profile.elo,
    )
    return res


def elo_report(ds: PlayerDataset, snapshots: list[dict]) -> dict[str, Any]:
    return {
        "official": {
            "elo": ds.profile.elo,
            "skill_level": ds.profile.skill_level,
            "source": ds.quality.source,
        },
        "snapshots": snapshots,
        "reconstructed": (recon := reconstruct(ds)),
        "projection": project(ds),
        "results_implied": results_implied(ds, recon),
        "implied": performance_implied(ds),
        "method": METHOD_RU,
    }
