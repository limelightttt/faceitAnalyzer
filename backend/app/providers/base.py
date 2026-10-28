"""Provider interface. Every provider returns raw payloads shaped exactly like FACEIT Data API v4
responses so a single normalizer handles live data and test fixtures alike."""

from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol

DataSource = Literal["faceit_api", "real_snapshot", "synthetic"]


class ProviderError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class PlayerNotFound(ProviderError):
    def __init__(self, nickname: str):
        super().__init__(f"Игрок '{nickname}' не найден на FACEIT", status=404)


class ProviderNotConfigured(ProviderError):
    def __init__(self):
        super().__init__(
            "FACEIT Data API не настроен: задайте FACEIT_API_KEY в backend/.env и перезапустите сервер",
            status=503,
        )


@dataclass
class FetchRecord:
    path: str
    fetched_at: datetime
    from_cache: bool
    stale: bool  # served from an expired cache because the live API failed


# Collected per request/job so the API can report data freshness honestly.
fetch_log: ContextVar[list[FetchRecord] | None] = ContextVar("fetch_log", default=None)


def record_fetch(rec: FetchRecord) -> None:
    log = fetch_log.get()
    if log is not None:
        log.append(rec)


def freshness_summary(records: list[FetchRecord]) -> dict[str, Any]:
    if not records:
        return {"requests": 0, "oldest": None, "stale": False, "from_cache": 0}
    oldest = min(r.fetched_at for r in records)
    return {
        "requests": len(records),
        "from_cache": sum(1 for r in records if r.from_cache),
        "stale": any(r.stale for r in records),
        "stale_paths": sorted({r.path for r in records if r.stale})[:10],
        "oldest": oldest.isoformat(),
    }


class FaceitProvider(Protocol):
    name: str

    def source_for(self, nickname: str) -> DataSource: ...

    async def get_player(self, nickname: str) -> dict[str, Any]:
        """GET /players?nickname=..."""

    async def get_player_by_id(self, player_id: str) -> dict[str, Any]:
        """GET /players/{id}"""

    async def get_player_by_steam(self, steam_id: str) -> dict[str, Any] | None:
        """GET /players?game=cs2&game_player_id=..."""

    async def get_history(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        """GET /players/{id}/history?game=cs2 (paged, newest first) -> items"""

    async def get_lifetime_stats(self, player_id: str) -> dict[str, Any] | None:
        """GET /players/{id}/stats/cs2"""

    async def get_recent_match_stats(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        """GET /players/{id}/games/cs2/stats -> items[].stats"""

    async def get_match(self, match_id: str, fresh: bool = False) -> dict[str, Any] | None:
        """GET /matches/{id}; `fresh` skips the short cache of a live match (the room may have changed)"""

    async def get_match_stats(self, match_id: str) -> dict[str, Any] | None:
        """GET /matches/{id}/stats"""
