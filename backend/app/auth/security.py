"""Sessions, CSRF and rate limiting.

* Session token: 256-bit random, sent only as an HttpOnly cookie; the DB stores its SHA-256.
* Rotation: every login/link issues a new token and deletes the previous session (no fixation).
* Expiry: absolute TTL + idle timeout.
* CSRF: synchronizer token kept server-side in the session, echoed by the SPA in `X-CSRF-Token` for
  unsafe methods, plus an Origin check. Cookies are SameSite=Lax (required for OAuth return redirects).
"""

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta
from urllib.parse import urlparse

from fastapi import HTTPException, Request, Response
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..config import Settings
from ..db import AuthSession, User, utcnow

SESSION_COOKIE = "fi_session"
BINDING_COOKIE = "fi_oauth_binding"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def set_cookie(resp: Response, settings: Settings, name: str, value: str, max_age: int) -> None:
    resp.set_cookie(
        name, value, max_age=max_age, httponly=True, secure=settings.secure_cookies, samesite="lax", path="/"
    )


def create_session(
    db: Session, resp: Response, settings: Settings, user: User, old_token: str | None
) -> AuthSession:
    if old_token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == sha256(old_token)))
    token = new_token()
    now = utcnow()
    s = AuthSession(
        token_hash=sha256(token),
        user_id=user.id,
        csrf_token=new_token(),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(s)
    user.last_login_at = now
    set_cookie(resp, settings, SESSION_COOKIE, token, settings.session_ttl_hours * 3600)
    return s


def load_session(db: Session, request: Request, settings: Settings) -> AuthSession | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    s = db.get(AuthSession, sha256(token))
    if s is None:
        return None
    now = utcnow()
    if s.expires_at < now or s.last_seen_at < now - timedelta(hours=settings.session_idle_hours):
        db.delete(s)
        return None
    if now - s.last_seen_at > timedelta(minutes=5):
        s.last_seen_at = now
    return s


def destroy_session(db: Session, request: Request, resp: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == sha256(token)))
    resp.delete_cookie(SESSION_COOKIE, path="/")


def purge_expired(db: Session) -> None:
    db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow()))


def check_csrf(request: Request, session: AuthSession | None, settings: Settings) -> None:
    if request.method not in UNSAFE:
        return
    origin = request.headers.get("origin")
    if origin:
        allowed = {_origin(settings.app_base_url), *(_origin(o) for o in settings.cors_origins)}
        if _origin(origin) not in allowed:
            raise HTTPException(403, "Запрос с недопустимого origin")
    if session is None:
        return  # anonymous unsafe requests are allowed only where the route permits anonymity
    header = request.headers.get("x-csrf-token", "")
    if not hmac.compare_digest(header, session.csrf_token):
        raise HTTPException(403, "CSRF-токен отсутствует или неверен")


def _origin(url: str) -> str:
    u = urlparse(url)
    return f"{u.scheme}://{u.netloc}".lower()


def safe_return_to(value: str | None) -> str:
    """Only same-site relative paths are allowed (no open redirects)."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    return value[:256]


class RateLimiter:
    """Small in-process sliding-window limiter (single-process deployment)."""

    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str, limit: int, window_s: float = 60.0) -> None:
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "Слишком много запросов, попробуйте через минуту")
        q.append(now)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def active_user(db: Session, s: AuthSession | None) -> User | None:
    return db.get(User, s.user_id) if s else None
