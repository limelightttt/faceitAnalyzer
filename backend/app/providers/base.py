"""Provider interface. Every provider returns raw payloads shaped exactly like FACEIT Data API v4
responses so a single normalizer (app/faceit_normalize.py) handles live data and fixtures alike."""

from typing import Any, Literal, Protocol

DataSource = Literal["faceit_api", "real_snapshot", "synthetic"]


class ProviderError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class PlayerNotFound(ProviderError):
    def __init__(self, nickname: str):
        super().__init__(f"Player '{nickname}' not found", status=404)


class FaceitProvider(Protocol):
    name: str

    def source_for(self, nickname: str) -> DataSource: ...

    async def get_player(self, nickname: str) -> dict[str, Any]:
        """GET /players?nickname=..."""

    async def get_history(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        """GET /players/{id}/history?game=cs2 (paged, newest first) -> items"""

    async def get_match(self, match_id: str) -> dict[str, Any] | None:
        """GET /matches/{id}"""

    async def get_match_stats(self, match_id: str) -> dict[str, Any] | None:
        """GET /matches/{id}/stats"""
