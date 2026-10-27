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

    # "auto": use the FACEIT Data API when FACEIT_API_KEY is set, otherwise local fixtures.
    faceit_provider: Literal["auto", "api", "fixtures"] = "auto"
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

    @property
    def api_enabled(self) -> bool:
        if self.faceit_provider == "fixtures":
            return False
        return self.faceit_api_key is not None and bool(self.faceit_api_key.get_secret_value().strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
