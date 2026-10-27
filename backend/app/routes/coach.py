from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import coach
from ..analytics import insights
from ..db import GameProfile, Goal, utcnow
from ..services.players import load_player_dataset
from ..state import AppState, Auth, get_db, get_state, require_user

router = APIRouter(prefix="/api/coach", tags=["coach"])

INSIGHT_TO_METRIC = {
    "kpr": "kd",
    "adr": "adr",
    "hs": "hs",
    "util_dmg": "utility_dpr",
    "flashed": "flashed_pr",
    "entry_success": "entry_success",
    "survival": "kd",
    "rating": "rating",
}


def _profile(db: Session, auth: Auth) -> GameProfile:
    gp = db.get(GameProfile, auth.user.id)
    if gp is None:
        raise HTTPException(
            409,
            "Игровой профиль FACEIT не определён: войдите через FACEIT или Steam с привязанным "
            "FACEIT-аккаунтом",
        )
    return gp


def _demo_analyses(state: AppState, user_id: int) -> list[tuple[str, str, dict]]:
    out = []
    for m in state.demos.list(user_id):
        if m["status"] == "done":
            a = state.demos.analysis(m["id"])
            if a:
                out.append((m["id"], m.get("finished_at") or m["created_at"], a))
    return out


def _progress(goal: Goal, ds, demo_rows: list[dict]) -> dict:
    meta = coach.METRICS[goal.metric]
    if meta["source"] == "demo":
        after = [
            r[goal.metric]
            for r in demo_rows
            if r[goal.metric] is not None
            and goal.baseline_until
            and datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")).replace(tzinfo=None)
            > goal.baseline_until
        ]
        cur = sum(after) / len(after) if after else None
        n = len(after)
    else:
        series = coach.faceit_series(ds, goal.metric, goal.map)
        after = [
            v for t, v in series if t and goal.baseline_until and t.replace(tzinfo=None) > goal.baseline_until
        ]
        cur = coach.pooled(after)
        n = len(after)
    reached = None
    if cur is not None and n >= coach.MIN_PROGRESS_N:
        reached = cur >= goal.target if goal.direction == "up" else cur <= goal.target
    frac = None
    if cur is not None and goal.target != goal.baseline:
        frac = max(-1.0, min(1.5, (cur - goal.baseline) / (goal.target - goal.baseline)))
    return {
        "current": round(cur, 4) if cur is not None else None,
        "n_after": n,
        "reached": reached,
        "fraction": round(frac, 3) if frac is not None else None,
        "enough_data": n >= coach.MIN_PROGRESS_N,
    }


@router.get("")
async def overview(
    db: Session = Depends(get_db), state: AppState = Depends(get_state), auth: Auth = Depends(require_user)
):
    gp = _profile(db, auth)
    ds = await load_player_dataset(state.provider, gp.nickname, 100, state.settings.data_dir, state.db)
    ins = insights.compute_insights(ds)
    steam = gp.steam_id or ds.profile.steam_id
    rows = coach.demo_rows(_demo_analyses(state, auth.user.id), steam)
    goals = db.scalars(
        select(Goal).where(Goal.user_id == auth.user.id).order_by(Goal.created_at.desc())
    ).all()
    suggestions = []
    for it in ins["items"]:
        if it["status"] == "weakness" and INSIGHT_TO_METRIC.get(it["key"]):
            m = INSIGHT_TO_METRIC[it["key"]]
            suggestions.append(
                {
                    "metric": m,
                    "label": coach.METRICS[m]["label"],
                    "why": f"{it['label']}: "
                    f"{it.get('player')} против {it.get('lobby')} у лобби (n = {it['n']}, "
                    f"доверие {it['confidence']})",
                }
            )
    if rows:
        mean_traded = [r["traded_death_rate"] for r in rows if r["traded_death_rate"] is not None]
        if mean_traded and sum(mean_traded) / len(mean_traded) < 0.3:
            suggestions.append(
                {
                    "metric": "traded_death_rate",
                    "label": coach.METRICS["traded_death_rate"]["label"],
                    "why": f"По {len(rows)} демкам разменивается {sum(mean_traded) / len(mean_traded):.0%} смертей",
                }
            )
    return {
        "profile": {"nickname": gp.nickname, "player_id": gp.faceit_player_id, "steam_id": steam},
        "quality": ds.quality,
        "weekly": coach.weekly(ds),
        "insights": {
            "strengths": ins["strengths"],
            "weaknesses": ins["weaknesses"],
            "matches_used": ins["matches_used"],
        },
        "demos": rows,
        "mistakes": coach.repeated_mistakes(rows),
        "suggestions": suggestions,
        "metrics": coach.METRICS,
        "goals": [
            {
                "id": g.id,
                "metric": g.metric,
                "label": coach.METRICS[g.metric]["label"],
                "map": g.map,
                "direction": g.direction,
                "baseline": g.baseline,
                "baseline_n": g.baseline_n,
                "target": g.target,
                "created_at": g.created_at.isoformat() + "Z",
                "status": g.status,
                "progress": _progress(g, ds, rows),
            }
            for g in goals
        ],
    }


class GoalIn(BaseModel):
    metric: str
    map: str | None = Field(default=None, max_length=32)
    target: float | None = None


@router.post("/goals", status_code=201)
async def create_goal(
    body: GoalIn,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(require_user),
):
    meta = coach.METRICS.get(body.metric)
    if meta is None:
        raise HTTPException(400, "Неизвестная метрика")
    if meta.get("needs_map") and not body.map:
        raise HTTPException(400, "Для этой цели нужна карта")
    gp = _profile(db, auth)
    if meta["source"] == "demo":
        rows = coach.demo_rows(_demo_analyses(state, auth.user.id), gp.steam_id)
        vals = [r[body.metric] for r in rows if r[body.metric] is not None]
        if len(vals) < 2:
            raise HTTPException(409, "Для цели по демкам нужно минимум 2 разобранные демки с вашим SteamID")
        base, n = sum(vals) / len(vals), len(vals)
    else:
        ds = await load_player_dataset(state.provider, gp.nickname, 100, state.settings.data_dir, state.db)
        series = coach.faceit_series(ds, body.metric, body.map)[-coach.WINDOW :]
        if len(series) < 8:
            raise HTTPException(409, f"Мало данных для базового уровня: {len(series)} матчей (нужно ≥ 8)")
        base, n = coach.pooled([v for _, v in series]), len(series)
    if body.target is None:
        step = abs(base) * 0.1 or 0.05
        target = base + step if meta["better"] == "up" else max(0.0, base - step)
    else:
        target = body.target
    g = Goal(
        user_id=auth.user.id,
        metric=body.metric,
        map=body.map,
        direction=meta["better"],
        baseline=round(base, 4),
        baseline_n=n,
        target=round(target, 4),
        baseline_until=utcnow(),
    )
    db.add(g)
    db.flush()
    return {"id": g.id, "baseline": g.baseline, "target": g.target, "baseline_n": n}


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    g = db.get(Goal, goal_id)
    if g is None or g.user_id != auth.user.id:
        raise HTTPException(404, "Цель не найдена")
    db.delete(g)
