"""Runtime configuration (env vars / .env). Secrets are never logged or returned by the API."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"), env_prefix="", extra="ignore"
    )

    # "api" (default): the real FACEIT Data API; without FACEIT_API_KEY requests fail with a clear 503.
    # "fixtures": offline regression datasets — for tests/development only, never a silent fallback.
    faceit_provider: Literal["api", "fixtures"] = "api"
    faceit_api_key: SecretStr | None = None
    faceit_api_base: str = "https://open.faceit.com/data/v4"
    # Client-side throttle; FACEIT enforces its own per-key quota and answers 429 when exceeded.
    faceit_requests_per_second: float = 4.0
    faceit_max_concurrency: int = 4

    fixtures_dir: Path = BACKEND_DIR / "fixtures" / "faceit"
    data_dir: Path = BACKEND_DIR / "data"
    sample_demos_dir: Path = BACKEND_DIR / "fixtures" / "demos"

    max_demo_upload_mb: int = Field(default=1024, ge=1)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # --- storage / auth -------------------------------------------------------------------------
    database_url: str = ""  # default: sqlite file in data_dir
    # Public origin of the app (used for OAuth/OpenID return URLs and cookie security).
    app_base_url: str = "http://localhost:8000"
    session_ttl_hours: int = 24 * 14
    session_idle_hours: int = 24 * 3
    # FACEIT Connect (OAuth2 authorization code + PKCE). Register an app at developers.faceit.com.
    faceit_client_id: str | None = None
    faceit_client_secret: SecretStr | None = None
    faceit_oauth_authorize_url: str = "https://accounts.faceit.com"
    faceit_oauth_token_url: str = "https://api.faceit.com/auth/v1/oauth/token"
    faceit_oauth_userinfo_url: str = "https://api.faceit.com/auth/v1/resources/userinfo"
    faceit_oauth_scopes: str = "openid profile"
    # Steam OpenID 2.0 needs no secret. A Steam Web API key is optional (persona name/avatar only).
    steam_openid_url: str = "https://steamcommunity.com/openid/login"
    steam_web_api_key: SecretStr | None = None
    # Test-only shortcut that creates a session without OAuth. Refused unless explicitly enabled AND the
    # app runs on localhost; never enable in production.
    auth_dev_login: bool = False
    auth_rate_limit_per_minute: int = 20
    # Private beta: data endpoints (players, scout, demos, maps) require a signed-in user.
    require_login: bool = True
    # Real Elo snapshots of linked users every N minutes (0 disables). One cached profile request per user.
    tracking_interval_minutes: int = 180
    # Pending predictions are compared with finished matches every N minutes (0 disables).
    prediction_check_minutes: int = 20
    # Optional comma-separated allowlist: SteamID64, FACEIT player id or FACEIT nickname. Empty = anyone may sign in.
    beta_allowlist: str = ""

    def allowed(self, *candidates: str | None) -> bool:
        entries = {e.strip().lower() for e in self.beta_allowlist.split(",") if e.strip()}
        return not entries or any(c and c.strip().lower() in entries for c in candidates)

    @property
    def api_enabled(self) -> bool:
        if self.faceit_provider == "fixtures":
            return False
        return self.faceit_api_key is not None and bool(self.faceit_api_key.get_secret_value().strip())

    @property
    def secure_cookies(self) -> bool:
        return self.app_base_url.startswith("https://")

    @property
    def faceit_oauth_configured(self) -> bool:
        return bool(
            self.faceit_client_id
            and self.faceit_client_secret
            and self.faceit_client_secret.get_secret_value()
        )

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{self.data_dir / 'app.db'}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
