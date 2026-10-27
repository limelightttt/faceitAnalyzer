"""FACEIT Data API v4 client (https://docs.faceit.com/docs/data-api/data).

Auth: server-side API key sent as `Authorization: Bearer <key>`.
Politeness: client-side token bucket + bounded concurrency, honours 429 Retry-After, retries 5xx.
Finished matches are immutable, so /matches/{id} and /matches/{id}/stats are cached on disk forever;
player profile/history are cached for a short TTL.
"""

import asyncio
import hashlib
import json
import time
from pathlib import Path
from typing import Any

import httpx

from .base import DataSource, PlayerNotFound, ProviderError

HISTORY_PAGE = 100  # API maximum for /history


class _RateLimiter:
    def __init__(self, rate: float):
        self.interval = 1.0 / max(rate, 0.1)
        self._next = 0.0
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            if self._next > now:
                await asyncio.sleep(self._next - now)
            self._next = max(now, self._next) + self.interval


class FaceitApiProvider:
    name = "faceit_api"

    def __init__(
        self,
        api_key: str,
        base_url: str,
        cache_dir: Path,
        rate: float = 4.0,
        concurrency: int = 4,
        transport: httpx.AsyncBaseTransport | None = None,
        profile_ttl: float = 300.0,
    ):
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            timeout=20.0,
            transport=transport,
        )
        self._limiter = _RateLimiter(rate)
        self._sem = asyncio.Semaphore(concurrency)
        self._cache_dir = cache_dir
        self._profile_ttl = profile_ttl
        cache_dir.mkdir(parents=True, exist_ok=True)

    def source_for(self, nickname: str) -> DataSource:
        return "faceit_api"

    def _cache_path(self, key: str) -> Path:
        return self._cache_dir / (hashlib.sha1(key.encode()).hexdigest() + ".json")

    async def _get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        ttl: float | None = None,
        allow_404: bool = False,
    ) -> dict[str, Any] | None:
        key = path + "?" + json.dumps(params or {}, sort_keys=True)
        cp = self._cache_path(key)
        if cp.exists() and (ttl is None or time.time() - cp.stat().st_mtime < ttl):
            return json.loads(cp.read_text("utf-8"))
        for attempt in range(5):
            async with self._sem:
                await self._limiter.wait()
                try:
                    resp = await self._client.get(path, params=params)
                except httpx.HTTPError as exc:
                    if attempt == 4:
                        raise ProviderError(f"FACEIT API unreachable: {exc.__class__.__name__}") from exc
                    await asyncio.sleep(2**attempt)
                    continue
            if resp.status_code == 200:
                data = resp.json()
                cp.write_text(json.dumps(data), "utf-8")
                return data
            if resp.status_code == 404 and allow_404:
                return None
            if resp.status_code == 429 or resp.status_code >= 500:
                retry_after = float(resp.headers.get("Retry-After", 2**attempt))
                await asyncio.sleep(min(retry_after, 30))
                continue
            if resp.status_code in (401, 403):
                raise ProviderError("FACEIT API rejected the API key (check FACEIT_API_KEY)", status=502)
            if resp.status_code == 404:
                raise ProviderError(f"FACEIT API: {path} not found", status=404)
            raise ProviderError(f"FACEIT API error {resp.status_code}", status=502)
        raise ProviderError("FACEIT API rate limit / server errors persisted after retries", status=503)

    async def get_player(self, nickname: str) -> dict[str, Any]:
        data = await self._get(
            "/players", {"nickname": nickname, "game": "cs2"}, ttl=self._profile_ttl, allow_404=True
        )
        if not data:
            raise PlayerNotFound(nickname)
        return data

    async def get_history(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        offset = 0
        while len(items) < limit:
            page = min(HISTORY_PAGE, limit - len(items))
            data = await self._get(
                f"/players/{player_id}/history",
                {"game": "cs2", "offset": offset, "limit": page},
                ttl=self._profile_ttl,
            )
            batch = (data or {}).get("items", [])
            items.extend(batch)
            if len(batch) < page:
                break
            offset += page
        return items[:limit]

    async def get_match(self, match_id: str) -> dict[str, Any] | None:
        return await self._get(f"/matches/{match_id}", allow_404=True)

    async def get_match_stats(self, match_id: str) -> dict[str, Any] | None:
        return await self._get(f"/matches/{match_id}/stats", allow_404=True)

    async def aclose(self) -> None:
        await self._client.aclose()
