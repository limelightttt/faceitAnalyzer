"""Persistent storage (SQLite by default, any SQLAlchemy URL works).

Separation of concerns, as required:
* users / identities         — internal account and *verified* external identities (FACEIT, Steam)
* game_profiles              — which FACEIT player the user plays as, and how that was established
* sessions / oauth_states    — auth state (only hashes of session tokens are stored)
* user_settings              — preferences
* player_snapshots           — official FACEIT values observed over time (Elo, level, lifetime stats)
* scout_reports / predictions / prediction_outcomes — immutable pre-match snapshots and later results
* feedback                   — user opinions about conclusions, stored separately from facts
* tactical_samples           — positional observations extracted from parsed demos
* goals                      — coaching goals with frozen baselines
"""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)  # stored naive-UTC (SQLite has no tz)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)


class Identity(Base):
    """A verified external login. (provider, subject) is globally unique: one identity -> one user."""

    __tablename__ = "identities"
    __table_args__ = (UniqueConstraint("provider", "subject"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(16))  # "faceit" | "steam" | "dev"
    subject: Mapped[str] = mapped_column(String(64))  # FACEIT guid / SteamID64
    display_name: Mapped[str | None] = mapped_column(String(64))
    verified_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class GameProfile(Base):
    __tablename__ = "game_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    faceit_player_id: Mapped[str] = mapped_column(String(64))
    nickname: Mapped[str] = mapped_column(String(64))
    steam_id: Mapped[str | None] = mapped_column(String(32))
    # "faceit_oauth" (verified), "steam_lookup" (verified Steam -> FACEIT profile with that SteamID)
    source: Mapped[str] = mapped_column(String(32))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AuthSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class OAuthState(Base):
    __tablename__ = "oauth_states"
    state: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider: Mapped[str] = mapped_column(String(16))
    code_verifier: Mapped[str | None] = mapped_column(String(128))
    browser_binding: Mapped[str] = mapped_column(String(64))  # hash of a cookie set when the flow started
    link_user_id: Mapped[int | None] = mapped_column(Integer)  # set when linking to an existing account
    return_to: Mapped[str] = mapped_column(String(256), default="/")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UserSettings(Base):
    __tablename__ = "user_settings"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AnalysisLog(Base):
    """History of analyses a user opened (players, matches, scouts, demos)."""

    __tablename__ = "analysis_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    ref: Mapped[str] = mapped_column(String(128))
    label: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PlayerSnapshot(Base):
    __tablename__ = "player_snapshots"
    __table_args__ = (Index("ix_snap_player_time", "player_id", "taken_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[str] = mapped_column(String(64))
    taken_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    elo: Mapped[int | None] = mapped_column(Integer)
    level: Mapped[int | None] = mapped_column(Integer)
    matches: Mapped[int | None] = mapped_column(Integer)


class ScoutReport(Base):
    __tablename__ = "scout_reports"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    match_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(16))  # queued|running|done|error
    progress: Mapped[float] = mapped_column(Float, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    match_status: Mapped[str | None] = mapped_column(String(16))
    report: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)


class Prediction(Base):
    """Immutable pre-match snapshot. Never updated after insert (enforced by a before_update hook)."""

    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[str] = mapped_column(String(64), index=True)
    scout_id: Mapped[str] = mapped_column(String(16))
    user_id: Mapped[int | None] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    match_status_at_prediction: Mapped[str] = mapped_column(String(16))
    pre_match: Mapped[bool] = mapped_column(Boolean)  # False if the match had already started
    algo_version: Mapped[str] = mapped_column(String(32))
    input_hash: Mapped[str] = mapped_column(String(64))
    data_as_of: Mapped[datetime | None] = mapped_column(DateTime)
    payload: Mapped[dict] = mapped_column(JSON)  # estimates, factors, uncertainty, signals


class PredictionOutcome(Base):
    __tablename__ = "prediction_outcomes"
    prediction_id: Mapped[int] = mapped_column(
        ForeignKey("predictions.id", ondelete="CASCADE"), primary_key=True
    )
    resolved_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    winner_faction: Mapped[str | None] = mapped_column(String(16))
    result: Mapped[dict] = mapped_column(JSON)


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    prediction_id: Mapped[int | None] = mapped_column(Integer, index=True)
    match_id: Mapped[str | None] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(
        String(128)
    )  # e.g. "briefing:3", "risk:<player_id>", "tactical:<steamid>"
    verdict: Mapped[str] = mapped_column(String(16))  # correct | incorrect | unsure
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class TacticalSample(Base):
    """One positional observation of a player in a parsed demo (round phase snapshot, contact, duel)."""

    __tablename__ = "tactical_samples"
    __table_args__ = (Index("ix_tac_player_map", "steam_id", "map"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    demo_id: Mapped[str] = mapped_column(String(32), index=True)
    steam_id: Mapped[str] = mapped_column(String(32))
    map: Mapped[str] = mapped_column(String(32))
    round: Mapped[int] = mapped_column(Integer)
    side: Mapped[str] = mapped_column(String(2))
    kind: Mapped[str] = mapped_column(String(16))  # setup | first_contact | duel_win | duel_loss
    phase: Mapped[str] = mapped_column(String(8))  # early | mid | late
    place: Mapped[str | None] = mapped_column(String(32))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    teammates: Mapped[list | None] = mapped_column(JSON)  # steam ids within the same place at that moment


class Goal(Base):
    __tablename__ = "goals"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    metric: Mapped[str] = mapped_column(String(32))
    map: Mapped[str | None] = mapped_column(String(32))
    direction: Mapped[str] = mapped_column(String(8))  # up | down
    baseline: Mapped[float] = mapped_column(Float)
    baseline_n: Mapped[int] = mapped_column(Integer)
    target: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    baseline_until: Mapped[datetime | None] = mapped_column(DateTime)  # matches after this count as progress
    status: Mapped[str] = mapped_column(String(16), default="active")


@event.listens_for(Prediction, "before_update")
def _immutable_prediction(*_):
    raise ValueError("predictions are immutable once stored")


class Database:
    def __init__(self, url: str):
        self.engine = create_engine(
            url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {}
        )
        if url.startswith("sqlite"):

            @event.listens_for(self.engine, "connect")
            def _fk(dbapi_conn, _):
                dbapi_conn.execute("PRAGMA foreign_keys=ON")
                dbapi_conn.execute("PRAGMA journal_mode=WAL")

        Base.metadata.create_all(self.engine)
        self._sessions = sessionmaker(self.engine, expire_on_commit=False)

    @contextmanager
    def session(self) -> Iterator[Session]:
        s = self._sessions()
        try:
            yield s
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()
