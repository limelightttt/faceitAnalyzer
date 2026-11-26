"""Fairness over a player's recent matches: a verdict per match and a test of which side gets the edge.

If matchmaking is fair, accounts with smurf signs land on either side at random: among the slots the
matchmaker fills (your four teammates minus your own party, five opponents) they should appear in
proportion to those slots. We count them on each side and ask how likely the observed split is by chance
(one-sided binomial test). Account data is current (matches, Elo, K/D today), not as of the match day.
"""

import asyncio
import secrets
from typing import Any

from scipy import stats as sps

from .. import fairness
from ..db import FairnessReport, utcnow
from ..domain import PlayerDataset
from ..providers.base import ProviderError
from ..scout.features import PlayerFeatures
from ..scout.service import player_bundle

WINDOW = 30
HISTORY_N = 20  # each account's last matches: enough to see who queues with whom
ALPHA = 0.05
MIN_EVIDENCE = 5
RATIO = 1.5
_tasks: set[asyncio.Task] = set()


def _p(k: int, n: int, p: float) -> float | None:
    return round(float(sps.binomtest(k, n, p, alternative="greater").pvalue), 4) if n else None


def _row(pm, v: dict[str, Any]) -> dict[str, Any]:
    return {
        "match_id": pm.match.match_id,
        "started_at": pm.match.started_at.isoformat() if pm.match.started_at else None,
        "map": pm.match.map,
        "won": pm.won,
        "score": f"{pm.score_for}:{pm.score_against}" if pm.score_for is not None else None,
        **{k: v[k] for k in ("code", "label", "chance_elo", "chance_real", "against", "favour")},
    }


def summarize(rows: list[dict[str, Any]], smurfs: dict[str, int], slots: dict[str, int]) -> dict[str, Any]:
    against = [r for r in rows if r["code"] == "against"]
    favour = [r for r in rows if r["code"] == "favour"]
    s_opp, s_team = smurfs["them"], smurfs["you"]
    rate_opp = s_opp / slots["them"] if slots["them"] else 0.0
    rate_team = s_team / slots["you"] if slots["you"] else 0.0
    ratio = (rate_opp / rate_team) if rate_team else None
    p_smurf = _p(s_opp, s_opp + s_team, slots["them"] / max(1, slots["them"] + slots["you"]))
    p_uneven = _p(len(against), len(against) + len(favour), 0.5)
    smurf_bias = (
        s_opp + s_team >= MIN_EVIDENCE
        and p_smurf is not None
        and p_smurf < ALPHA
        and (ratio is None or ratio >= RATIO)
    )
    uneven_bias = len(against) >= MIN_EVIDENCE and p_uneven is not None and p_uneven < ALPHA
    lost = sum(1 for r in against if r["won"] is False)
    facts = [
        f"Неравных матчей против вас: {len(against)} из {len(rows)} (проиграно {lost}), в вашу пользу: {len(favour)}.",
        f"Аккаунты со смурф-признаками: у соперников {s_opp} на {slots['them']} мест, "
        f"у тиммейтов {s_team} на {slots['you']} мест (без вас и вашей пати).",
    ]
    if smurf_bias or uneven_bias:
        code = "anomaly"
        parts = []
        if smurf_bias:
            where = (
                f"в {ratio:.1f} раза чаще у соперников, чем у ваших тиммейтов"
                if ratio
                else f"только у соперников ({s_opp}), у ваших тиммейтов ни одного"
            )
            parts.append(f"смурф-признаки {where} (шанс случайности {p_smurf:.1%})")
        if uneven_bias:
            parts.append(
                f"неравных матчей против вас {len(against)}, в вашу пользу {len(favour)} "
                f"(шанс случайности {p_uneven:.1%})"
            )
        title = "АНОМАЛИЯ: " + "; ".join(parts)
    elif len(against) > len(favour) or s_opp / max(1, slots["them"]) > s_team / max(1, slots["you"]):
        code = "lean"
        title = "Перекос против вас есть, но такой бывает и случайно"
    else:
        code = "none"
        title = "Перекоса против вас не видно: неравные матчи и смурф-признаки распределены примерно поровну"
    return {
        "code": code,
        "title": title,
        "facts": facts,
        "matches": len(rows),
        "against": len(against),
        "favour": len(favour),
        "lost_against": lost,
        "smurfs": {
            "them": s_opp,
            "you": s_team,
            "slots_them": slots["them"],
            "slots_you": slots["you"],
            "ratio": round(ratio, 2) if ratio else None,
            "p_value": p_smurf,
        },
        "p_uneven": p_uneven,
        "note": "Матчи, Elo и K/D аккаунтов — на сегодня, а не на день игры.",
    }


async def analyze(provider, ds: PlayerDataset, progress=None) -> dict[str, Any]:
    ms = [pm for pm in ds.matches[:WINDOW] if len(pm.match.teams) == 2]
    roster = {p.player_id: p.nickname for pm in ms for t in pm.match.teams for p in t.players}
    done = 0

    async def one(pid: str) -> PlayerFeatures:
        nonlocal done
        f = await player_bundle(
            provider, {"player_id": pid, "nickname": roster[pid]}, "x", recent_n=0, history_n=HISTORY_N
        )
        done += 1
        if progress:
            progress(0.05 + 0.9 * done / len(roster))
        return f

    feats = dict(zip(roster, await asyncio.gather(*(one(pid) for pid in roster)), strict=True))
    me = ds.profile.player_id
    rows, smurfs, slots = [], {"you": 0, "them": 0}, {"you": 0, "them": 0}
    for pm in ms:
        team, opp = pm.match.teams[pm.team_index], pm.match.teams[1 - pm.team_index]
        party = {me} | {p.player_id for p in team.players if p.nickname in pm.party_members}
        v = fairness.verdict(
            fairness.Side([feats[p.player_id] for p in team.players], pm.team_avg_elo, exclude=party),
            fairness.Side([feats[p.player_id] for p in opp.players], pm.opp_avg_elo),
            pm.win_probability,
        )
        rows.append(_row(pm, v))
        smurfs["you"] += len(v["you"]["smurfs"])
        smurfs["them"] += len(v["them"]["smurfs"])
        slots["you"] += len(team.players) - len(party)
        slots["them"] += len(opp.players)
    missing = sum(1 for f in feats.values() if f.errors)
    out = summarize(rows, smurfs, slots) | {"rows": rows, "accounts": len(feats), "accounts_missing": missing}
    return out


def start(state, ds: PlayerDataset) -> str:
    rid = secrets.token_hex(6)
    with state.db.session() as s:
        s.add(FairnessReport(id=rid, player_id=ds.profile.player_id, status="running", progress=0.02))

    def update(**kw):
        with state.db.session() as s:
            row = s.get(FairnessReport, rid)
            for k, v in kw.items():
                setattr(row, k, v)

    async def run():
        try:
            result = await analyze(state.provider, ds, lambda v: update(progress=round(v, 2)))
            update(status="done", progress=1.0, result=result, finished_at=utcnow())
        except ProviderError as exc:
            update(status="error", error=str(exc), finished_at=utcnow())
        except asyncio.CancelledError:
            update(
                status="error",
                error="Проверка прервана остановкой сервера — запустите снова",
                finished_at=utcnow(),
            )
            raise
        except Exception as exc:  # keep the job inspectable instead of hanging in "running"
            update(
                status="error",
                error=f"Внутренняя ошибка: {exc.__class__.__name__}: {exc}",
                finished_at=utcnow(),
            )

    task = asyncio.get_running_loop().create_task(run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return rid
