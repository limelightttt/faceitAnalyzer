"""Application wiring: one container per app instance (tests build their own with temp dirs)."""

from dataclasses import dataclass, field

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .auth.security import RateLimiter, check_csrf, load_session
from .config import Settings
from .db import AuthSession, Database, User
from .demo.store import DemoStore
from .providers.faceit_api import FaceitApiProvider, UnconfiguredProvider
from .providers.fixtures import FixtureProvider


@dataclass
class AppState:
    settings: Settings
    db: Database
    provider: object
    demos: DemoStore
    limiter: RateLimiter = field(default_factory=RateLimiter)
    auth_transport: object | None = None  # outbound OpenID/OAuth HTTP transport (tests inject a mock)


def build_state(settings: Settings, provider: object | None = None) -> AppState:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    if provider is not None:
        pass
    elif settings.faceit_provider == "fixtures":
        provider = FixtureProvider(settings.fixtures_dir)
    elif settings.api_enabled:
        provider = FaceitApiProvider(
            settings.faceit_api_key.get_secret_value(),
            settings.faceit_api_base,
            settings.data_dir / "api_cache",
            settings.faceit_requests_per_second,
            settings.faceit_max_concurrency,
        )
    else:
        provider = UnconfiguredProvider()
    db = Database(settings.db_url)
    return AppState(settings=settings, db=db, provider=provider, demos=DemoStore(settings.data_dir / "demos"))


def get_state(request: Request) -> AppState:
    return request.app.state.ctx


def get_db(state: AppState = Depends(get_state)):
    with state.db.session() as s:
        yield s


class Auth:
    def __init__(self, session: AuthSession | None, user: User | None):
        self.session = session
        self.user = user


def get_auth(request: Request, db: Session = Depends(get_db), state: AppState = Depends(get_state)) -> Auth:
    s = load_session(db, request, state.settings)
    check_csrf(request, s, state.settings)
    return Auth(s, db.get(User, s.user_id) if s else None)


def require_user(auth: Auth = Depends(get_auth)) -> Auth:
    from fastapi import HTTPException

    if auth.user is None:
        raise HTTPException(401, "Требуется вход")
    return auth


def require_access(auth: Auth = Depends(get_auth), state: AppState = Depends(get_state)) -> Auth:
    """Data endpoints: open on a developer box, sign-in required for the private beta (REQUIRE_LOGIN)."""
    from fastapi import HTTPException

    if state.settings.require_login and auth.user is None:
        raise HTTPException(401, "Войдите, чтобы пользоваться FACEIT Intelligence")
    return auth
