"""Prediction validation: outcomes are attached to immutable snapshots; metrics are recomputed from data.

No "self-learning": we report Brier score / log loss / calibration against a coin-flip baseline and the
usefulness of individual signals, so any future recalibration is an explicit, reviewable change."""

import math
from collections import defaultdict
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Database, Feedback, Prediction, PredictionOutcome, utcnow
from .providers.base import ProviderError

MIN_AGE = timedelta(minutes=10)


async def resolve_pending(db: Database, provider, user_id: int | None, limit: int = 30) -> dict[str, int]:
    with db.session() as s:
        q = select(Prediction).outerjoin(PredictionOutcome).where(PredictionOutcome.prediction_id.is_(None))
        if user_id is not None:
            q = q.where(Prediction.user_id == user_id)
        pending = [(p.id, p.match_id, p.payload) for p in s.scalars(q.limit(limit))]
    resolved = 0
    for pid, mid, payload in pending:
        try:
            details = await provider.get_match(mid)
        except ProviderError:
            continue
        status = str((details or {}).get("status", "")).upper()
        if status not in ("FINISHED", "CANCELLED", "ABORTED"):
            continue
        result: dict[str, Any] = {"status": status}
        winner = (details.get("results") or {}).get("winner") if status == "FINISHED" else None
        if winner:
            p1 = payload.get("elo_expectation_faction1")
            y = 1.0 if winner == "faction1" else 0.0
            if p1 is not None:
                result.update(
                    brier=round((p1 - y) ** 2, 4),
                    log_loss=round(-math.log(max(1e-6, p1 if y else 1 - p1)), 4),
                    p_winner=round(p1 if y else 1 - p1, 3),
                )
            fav = payload.get("favoured")
            result["favoured_correct"] = None if fav is None else fav == winner
            try:
                stats = await provider.get_match_stats(mid)
            except ProviderError:
                stats = None
            result["signals"] = _signal_outcomes(payload, stats, winner)
        with db.session() as s:
            if s.get(PredictionOutcome, pid) is None:
                s.add(PredictionOutcome(prediction_id=pid, winner_faction=winner, result=result))
                resolved += 1
    return {"checked": len(pending), "resolved": resolved}


def _signal_outcomes(payload: dict, stats: dict | None, winner: str) -> dict[str, Any]:
    out: dict[str, Any] = {"risk": [], "threats": []}
    if not stats:
        return out
    rnd = (stats.get("rounds") or [{}])[0]
    ratings = []
    for t in rnd.get("teams", []):
        for p in t.get("players", []):
            ps = p.get("player_stats") or {}
            kills, deaths = float(ps.get("Kills", 0) or 0), float(ps.get("Deaths", 0) or 0)
            adr = float(ps.get("ADR", 0) or 0)
            ratings.append((p["player_id"], kills / max(deaths, 1), adr))
    ranked = [pid for pid, _, _ in sorted(ratings, key=lambda r: -r[2])]
    for pid, flag in (payload.get("risk_flags") or {}).items():
        if pid in ranked:
            out["risk"].append(
                {
                    "player_id": pid,
                    "classification": flag["classification"],
                    "adr_rank": ranked.index(pid) + 1,
                    "top3": ranked.index(pid) < 3,
                }
            )
    for fk, pid in (payload.get("threat_top") or {}).items():
        if pid in ranked:
            out["threats"].append(
                {
                    "faction": fk,
                    "player_id": pid,
                    "adr_rank": ranked.index(pid) + 1,
                    "top3": ranked.index(pid) < 3,
                }
            )
    return out


def metrics(s: Session, user_id: int | None) -> dict[str, Any]:
    q = select(Prediction, PredictionOutcome).join(PredictionOutcome)
    if user_id is not None:
        q = q.where(Prediction.user_id == user_id)
    rows = [(p, o) for p, o in s.execute(q).all() if p.pre_match and o.winner_faction]
    rows.sort(key=lambda po: po[0].created_at)
    scored = [(p, o) for p, o in rows if "brier" in o.result]
    n = len(scored)
    res: dict[str, Any] = {"resolved": len(rows), "scored": n}
    if n:
        brier = sum(o.result["brier"] for _, o in scored) / n
        ll = sum(o.result["log_loss"] for _, o in scored) / n
        fav = [
            o.result["favoured_correct"] for _, o in scored if o.result.get("favoured_correct") is not None
        ]
        bins = defaultdict(lambda: [0, 0.0, 0])  # n, sum p_fav1, wins of faction1
        for p, o in scored:
            p1 = p.payload["elo_expectation_faction1"]
            b = min(9, int(p1 * 10))
            bins[b][0] += 1
            bins[b][1] += p1
            bins[b][2] += 1 if o.winner_faction == "faction1" else 0
        cum, running = [], 0.0
        for i, (_, o) in enumerate(scored, 1):
            running += o.result["brier"]
            cum.append({"n": i, "brier": round(running / i, 4)})
        res.update(
            brier=round(brier, 4),
            baseline_brier=0.25,
            log_loss=round(ll, 4),
            baseline_log_loss=round(math.log(2), 4),
            skill_vs_baseline=round(1 - brier / 0.25, 3),
            favourite_accuracy=round(sum(fav) / len(fav), 3) if fav else None,
            favourite_n=len(fav),
            calibration=[
                {
                    "bin": f"{b * 10}–{b * 10 + 10}%",
                    "n": v[0],
                    "predicted": round(v[1] / v[0], 3),
                    "observed": round(v[2] / v[0], 3),
                }
                for b, v in sorted(bins.items())
            ],
            cumulative=cum,
        )
    risk = [r for _, o in rows for r in (o.result.get("signals") or {}).get("risk", [])]
    threats = [r for _, o in rows for r in (o.result.get("signals") or {}).get("threats", [])]
    res["signals"] = {
        "risk_flags": len(risk),
        "risk_flag_top3_rate": round(sum(r["top3"] for r in risk) / len(risk), 2) if risk else None,
        "threats": len(threats),
        "threat_top3_rate": round(sum(t["top3"] for t in threats) / len(threats), 2) if threats else None,
        "note": "Случайный игрок попадает в топ-3 по ADR с вероятностью 30% — это базовый уровень для сравнения.",
    }
    fq = select(Feedback) if user_id is None else select(Feedback).where(Feedback.user_id == user_id)
    fb = list(s.scalars(fq))
    res["feedback"] = {
        "total": len(fb),
        "by_verdict": {v: sum(1 for f in fb if f.verdict == v) for v in ("correct", "incorrect", "unsure")},
    }
    res["min_for_conclusions"] = 30
    return res


def serialize(p: Prediction, o: PredictionOutcome | None) -> dict[str, Any]:
    return {
        "id": p.id,
        "match_id": p.match_id,
        "scout_id": p.scout_id,
        "created_at": p.created_at.isoformat() + "Z",
        "match_status_at_prediction": p.match_status_at_prediction,
        "pre_match": p.pre_match,
        "algo_version": p.algo_version,
        "input_hash": p.input_hash,
        "data_as_of": p.data_as_of.isoformat() + "Z" if p.data_as_of else None,
        "payload": p.payload,
        "outcome": None
        if o is None
        else {"resolved_at": o.resolved_at.isoformat() + "Z", "winner": o.winner_faction, **o.result},
        "pending_age_ok": utcnow() - p.created_at > MIN_AGE,
    }
