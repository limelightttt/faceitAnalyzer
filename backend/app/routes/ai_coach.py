"""AI coach: a review on demand, follow-up questions, daily limits per player and a monthly budget.

Money is spent only on an explicit click. The same data never pays twice (the stored review is shown),
and a question sends the dossier (cached by the API), the coach's notes and the last few replies, never
the whole conversation, so the 20th question costs the same as the first.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..ai_coach import dossier as dossier_mod
from ..ai_coach.llm import CoachUnavailable, Usage
from ..ai_coach.review import checked
from ..db import CoachCall, CoachMessage, CoachReview, PlayerSnapshot, utcnow
from ..services.players import load_player_dataset
from ..state import AppState, Auth, get_db, get_state, require_user
from .coach import _profile, gather

router = APIRouter(prefix="/api/coach/ai", tags=["coach"])

WINDOW = timedelta(hours=24)
ELO_HISTORY = timedelta(days=60)
TURNS_KEPT = 4  # last replies sent along with a question; older context lives in the coach's notes
MEMORY_MAX = 1000


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() + "Z" if dt else None


def _limit(db: Session, user_id: int, kind: str, per_day: int, unlimited: bool) -> dict:
    since = utcnow() - WINDOW
    times = db.scalars(
        select(CoachCall.created_at)
        .where(CoachCall.user_id == user_id, CoachCall.kind == kind, CoachCall.created_at > since)
        .order_by(CoachCall.created_at)
    ).all()
    if unlimited:
        return {"limit": None, "used": len(times), "left": None, "reset_at": None}
    # a slot frees 24 hours after the oldest call in the window
    return {
        "limit": per_day,
        "used": len(times),
        "left": max(0, per_day - len(times)),
        "reset_at": _iso(times[0] + WINDOW) if times else None,
    }


def _month_spent(db: Session) -> float:
    start = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return float(
        db.scalar(select(func.coalesce(func.sum(CoachCall.cost_usd), 0)).where(CoachCall.created_at >= start))
    )


def _allow(db: Session, state: AppState, limit: dict, what: str) -> None:
    if limit["left"] == 0:
        raise HTTPException(
            429, f"Лимит: {limit['limit']} {what} за 24 часа. Следующий станет доступен позже."
        )
    budget = state.settings.coach_monthly_budget_usd
    if _month_spent(db) >= budget:
        raise HTTPException(
            503, f"Месячный бюджет ИИ-коуча (${budget:g}) исчерпан — коуч вернётся 1-го числа."
        )


def _record(db: Session, user_id: int, kind: str, usage: Usage) -> None:
    db.add(
        CoachCall(
            user_id=user_id,
            kind=kind,
            model=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=usage.cache_read_tokens,
            cache_write_tokens=usage.cache_write_tokens,
            cost_usd=usage.cost_usd,
        )
    )
    db.flush()


def _llm(state: AppState):
    if state.coach_llm is None:
        raise HTTPException(
            503, "ИИ-коуч не настроен: владельцу нужно вписать ANTHROPIC_API_KEY в backend\\.env"
        )
    return state.coach_llm


async def _ask_model(db: Session, user_id: int, kind: str, call):
    try:
        out, usage = await call
    except CoachUnavailable as exc:
        if exc.usage:
            _record(db, user_id, kind, exc.usage)
            db.commit()  # billed even though there is nothing to show
        raise HTTPException(exc.status, str(exc)) from exc
    _record(db, user_id, kind, usage)
    return out, usage


def _latest(db: Session, user_id: int) -> CoachReview | None:
    return db.scalar(
        select(CoachReview).where(CoachReview.user_id == user_id).order_by(CoachReview.id.desc()).limit(1)
    )


def _messages(db: Session, review_id: int) -> list[CoachMessage]:
    return list(
        db.scalars(select(CoachMessage).where(CoachMessage.review_id == review_id).order_by(CoachMessage.id))
    )


def _review_out(db: Session, r: CoachReview, cached: bool = False) -> dict:
    return {
        "id": r.id,
        "created_at": _iso(r.created_at),
        "model": r.model,
        "cached": cached,
        **r.result,
        "messages": [
            {"role": m.role, "text": m.text, "created_at": _iso(m.created_at)} for m in _messages(db, r.id)
        ],
    }


def _status(db: Session, state: AppState, auth: Auth, nickname: str) -> dict:
    s = state.settings
    owner = s.is_coach_owner(nickname)
    return {
        "enabled": state.coach_llm is not None,
        "owner": owner,
        "models": {"review": s.coach_review_model, "chat": s.coach_chat_model},
        "limits": {
            "reviews": _limit(db, auth.user.id, "review", s.coach_reviews_per_day, owner),
            "questions": _limit(db, auth.user.id, "question", s.coach_questions_per_day, owner),
        },
    }


@router.get("")
async def status(
    db: Session = Depends(get_db), state: AppState = Depends(get_state), auth: Auth = Depends(require_user)
):
    gp = _profile(db, auth)
    review = _latest(db, auth.user.id)
    new_matches = None
    if review:
        ds = await load_player_dataset(state.provider, gp.nickname, 100, state.settings.data_dir, state.db)
        ids = [m.match.match_id for m in ds.matches]
        new_matches = ids.index(review.last_match_id) if review.last_match_id in ids else len(ids)
    return _status(db, state, auth, gp.nickname) | {
        "review": _review_out(db, review) if review else None,
        "new_matches": new_matches,
    }


@router.post("/review")
async def create_review(
    db: Session = Depends(get_db), state: AppState = Depends(get_state), auth: Auth = Depends(require_user)
):
    llm = _llm(state)
    g = await gather(db, state, auth)
    gp, ds = g["profile"], g["ds"]
    elo = db.execute(
        select(PlayerSnapshot.taken_at, PlayerSnapshot.elo)
        .where(
            PlayerSnapshot.player_id == gp.faceit_player_id,
            PlayerSnapshot.taken_at >= utcnow() - ELO_HISTORY,
            PlayerSnapshot.elo.is_not(None),
        )
        .order_by(PlayerSnapshot.taken_at)
    ).all()
    dossier = dossier_mod.build(
        ds, g["insights"], g["weekly"], g["demos"], g["mistakes"], g["goals"], list(elo)
    )
    digest = dossier_mod.digest(dossier)
    latest = _latest(db, auth.user.id)
    if latest and latest.data_hash == digest:  # nothing changed since the last review: free
        return _review_out(db, latest, cached=True)
    st = _status(db, state, auth, gp.nickname)
    _allow(db, state, st["limits"]["reviews"], "разбора")
    review, usage = await _ask_model(db, auth.user.id, "review", llm.review(dossier))
    row = CoachReview(
        user_id=auth.user.id,
        model=usage.model,
        data_hash=digest,
        last_match_id=ds.matches[0].match.match_id if ds.matches else None,
        dossier=dossier,
        result=checked(review, dossier["facts"]),
    )
    db.add(row)
    db.flush()
    return _review_out(db, row)


class QuestionIn(BaseModel):
    question: str = Field(min_length=2, max_length=600)


@router.post("/ask")
async def ask(
    body: QuestionIn,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(require_user),
):
    llm = _llm(state)
    gp = _profile(db, auth)
    review = _latest(db, auth.user.id)
    if review is None:
        raise HTTPException(409, "Сначала получите разбор — вопросы задаются по нему")
    st = _status(db, state, auth, gp.nickname)
    _allow(db, state, st["limits"]["questions"], "вопросов")
    turns = [(m.role, m.text) for m in _messages(db, review.id)[-TURNS_KEPT:]]
    question = body.question.strip()
    answer, _ = await _ask_model(
        db,
        auth.user.id,
        "question",
        llm.answer(review.dossier, review.result, review.memory, turns, question),
    )
    db.add_all(
        [
            CoachMessage(review_id=review.id, role="player", text=question),
            CoachMessage(review_id=review.id, role="coach", text=answer.answer),
        ]
    )
    review.memory = answer.memory[:MEMORY_MAX]
    db.flush()
    return {"answer": answer.answer}
