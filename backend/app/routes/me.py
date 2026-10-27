"""Personal data: settings, analysis history."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import AnalysisLog, UserSettings
from ..state import Auth, get_db, require_user

router = APIRouter(prefix="/api/me", tags=["me"])


class SettingsModel(BaseModel):
    sample_size: Literal[20, 50, 100, 200] = 100
    preferred_maps: list[str] = Field(default_factory=list, max_length=10)
    show_risk_signals: bool = True
    timezone: str = Field(default="Europe/Moscow", max_length=64)
    watchlist: list[str] = Field(default_factory=list, max_length=30)


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    row = db.get(UserSettings, auth.user.id)
    return SettingsModel(**(row.data if row else {})).model_dump()


@router.put("/settings")
def put_settings(body: SettingsModel, db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    row = db.get(UserSettings, auth.user.id)
    if row is None:
        db.add(UserSettings(user_id=auth.user.id, data=body.model_dump()))
    else:
        row.data = body.model_dump()
    return body.model_dump()


@router.get("/history")
def history(db: Session = Depends(get_db), auth: Auth = Depends(require_user)):
    rows = db.scalars(
        select(AnalysisLog)
        .where(AnalysisLog.user_id == auth.user.id)
        .order_by(AnalysisLog.created_at.desc())
        .limit(50)
    ).all()
    return [{"kind": r.kind, "ref": r.ref, "label": r.label, "at": r.created_at.isoformat()} for r in rows]


def log_analysis(db: Session, auth: Auth, kind: str, ref: str, label: str) -> None:
    if auth.user is None:
        return
    last = db.scalar(
        select(AnalysisLog)
        .where(AnalysisLog.user_id == auth.user.id)
        .order_by(AnalysisLog.created_at.desc())
        .limit(1)
    )
    if last and last.kind == kind and last.ref == ref:
        return
    db.add(AnalysisLog(user_id=auth.user.id, kind=kind, ref=ref[:128], label=label[:128]))
