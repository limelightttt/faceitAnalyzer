from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth.security import client_ip
from ..db import Feedback, GameProfile, Prediction, PredictionOutcome, ScoutReport, utcnow
from ..predictions import metrics, resolve_pending, serialize
from ..providers.base import ProviderError
from ..scout.service import start_job
from ..scout.url import parse_match_ref
from ..state import AppState, Auth, get_db, get_state, require_access, require_user
from .me import log_analysis

router = APIRouter(prefix="/api", tags=["scout"])
REUSE_SECONDS = 300


class ScoutRequest(BaseModel):
    url: str = Field(max_length=300)
    refresh: bool = False


def _user_player(db: Session, auth: Auth) -> str | None:
    if auth.user is None:
        return None
    gp = db.get(GameProfile, auth.user.id)
    return gp.faceit_player_id if gp else None


@router.post("/scout", status_code=202)
async def create_scout(
    body: ScoutRequest,
    request: Request,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(require_access),
):
    match_id = parse_match_ref(body.url)
    if not match_id:
        raise HTTPException(
            400, "Не похоже на ссылку на комнату FACEIT: ожидается https://www.faceit.com/…/room/1-…"
        )
    state.limiter.check(f"scout:{auth.user.id if auth.user else client_ip(request)}", 12)
    if not body.refresh:
        q = select(ScoutReport).where(
            ScoutReport.match_id == match_id,
            ScoutReport.status.in_(["running", "done"]),
            ScoutReport.user_id == (auth.user.id if auth.user else None),
        )
        recent = db.scalar(q.order_by(ScoutReport.created_at.desc()).limit(1))
        if recent and (utcnow() - recent.created_at).total_seconds() < REUSE_SECONDS:
            return {"id": recent.id, "match_id": match_id, "reused": True}
    sid = start_job(state, match_id, auth.user.id if auth.user else None, _user_player(db, auth))
    return {"id": sid, "match_id": match_id, "reused": False}


@router.get("/scout/{sid}")
def get_scout(sid: str, db: Session = Depends(get_db), auth: Auth = Depends(require_access)):
    row = db.get(ScoutReport, sid)
    # reports of signed-in users (with their prediction and "you" perspective) are private to their owner
    if row is None or (row.user_id is not None and (auth.user is None or auth.user.id != row.user_id)):
        raise HTTPException(404, "Отчёт не найден")
    pred = db.scalar(
        select(Prediction)
        .where(Prediction.match_id == row.match_id, Prediction.user_id == row.user_id)
        .limit(1)
    )
    out = {
        "id": row.id,
        "match_id": row.match_id,
        "status": row.status,
        "progress": row.progress,
        "error": row.error,
        "created_at": row.created_at.isoformat() + "Z",
        "report": row.report,
        "prediction": None,
    }
    if pred:
        out["prediction"] = serialize(pred, db.get(PredictionOutcome, pred.id))
    if row.status == "done" and row.report:
        t = row.report["teams"]
        log_analysis(db, auth, "scout", row.id, f"{t['faction1']['name']} vs {t['faction2']['name']}")
    return out


@router.get("/scout-detect")
async def detect_active(
    db: Session = Depends(get_db), state: AppState = Depends(get_state), auth: Auth = Depends(require_user)
):
    """Best effort: the public Data API has no 'current match' endpoint. We check the newest history item;
    if it is not finished, it is returned. Otherwise the user must paste the matchroom URL."""
    pid = _user_player(db, auth)
    if not pid:
        return {
            "found": False,
            "reason": "Игровой профиль FACEIT не определён — войдите через FACEIT или Steam",
        }
    try:
        hist = await state.provider.get_history(pid, 3)
    except ProviderError as exc:
        return {"found": False, "reason": str(exc)}
    for item in hist:
        if str(item.get("status", "")).upper() not in ("FINISHED", "CANCELLED"):
            return {"found": True, "match_id": item["match_id"]}
    return {
        "found": False,
        "reason": "Активный матч через публичный Data API не обнаружен (API отдаёт историю "
        "завершённых матчей). Вставьте ссылку на комнату матча.",
    }


@router.get("/predictions")
def list_predictions(db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    rows = db.scalars(
        select(Prediction)
        .where(Prediction.user_id == auth.user.id)
        .order_by(Prediction.created_at.desc())
        .limit(200)
    ).all()
    return [serialize(p, db.get(PredictionOutcome, p.id)) for p in rows]


@router.post("/predictions/resolve")
async def resolve(state: AppState = Depends(get_state), auth: Auth = Depends(require_user)):
    return await resolve_pending(state.db, state.provider, auth.user.id)


@router.get("/predictions/metrics")
def prediction_metrics(db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    return metrics(db, auth.user.id)


class FeedbackIn(BaseModel):
    match_id: str | None = Field(default=None, max_length=64)
    prediction_id: int | None = None
    target: str = Field(max_length=128)
    verdict: str = Field(pattern="^(correct|incorrect|unsure)$")
    comment: str | None = Field(default=None, max_length=1000)


@router.post("/feedback", status_code=201)
def add_feedback(body: FeedbackIn, db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    if body.prediction_id is not None:
        pred = db.get(Prediction, body.prediction_id)
        if pred is None or pred.user_id != auth.user.id:
            raise HTTPException(404, "Прогноз не найден")
    fb = Feedback(user_id=auth.user.id, **body.model_dump())
    db.add(fb)
    db.flush()
    return {"id": fb.id}


@router.get("/feedback")
def list_feedback(
    match_id: str | None = None, db: Session = Depends(get_db), auth: Auth = Depends(require_user)
):
    q = select(Feedback).where(Feedback.user_id == auth.user.id)
    if match_id:
        q = q.where(Feedback.match_id == match_id)
    return [
        {
            "id": f.id,
            "target": f.target,
            "verdict": f.verdict,
            "comment": f.comment,
            "match_id": f.match_id,
            "prediction_id": f.prediction_id,
            "created_at": f.created_at.isoformat() + "Z",
        }
        for f in db.scalars(q)
    ]
