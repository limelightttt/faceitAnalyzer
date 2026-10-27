"""FACEIT Data API v4 client (https://docs.faceit.com/docs/data-api/data).

Auth: server-side API key sent as `Authorization: Bearer <key>` (never sent to the browser).
Politeness: client-side token bucket + bounded concurrency, honours 429 Retry-After, retries 5xx.
Caching: finished matches are immutable and cached forever; live matches 20 s; profiles/stats minutes.
Resilience: if the live API fails and an expired cache entry exists, it is served and flagged `stale`
(see providers.base.fetch_log) — never replaced by invented data.
"""

import asyncio
import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from .base import DataSource, FetchRecord, PlayerNotFound, ProviderError, record_fetch

HISTORY_PAGE = 100  # API maximum for /history
STATS_PAGE = 100  # API maximum for /games/{game}/stats
FINAL_STATUSES = {"FINISHED", "CANCELLED", "ABORTED"}

TTL_PROFILE = 600.0
TTL_STATS = 1800.0
TTL_HISTORY = 600.0
TTL_LIVE_MATCH = 20.0


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
        profile_ttl: float = TTL_PROFILE,
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
        self._inflight: dict[str, asyncio.Future] = {}
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
        ttl_fn=None,
    ) -> dict[str, Any] | None:
        key = path + "?" + json.dumps(params or {}, sort_keys=True)
        cp = self._cache_path(key)
        if cp.exists():
            cached = json.loads(cp.read_text("utf-8"))
            eff_ttl = ttl_fn(cached["body"]) if ttl_fn and cached.get("body") is not None else ttl
            if eff_ttl is None or time.time() - cached["at"] < eff_ttl:
                record_fetch(FetchRecord(path, datetime.fromtimestamp(cached["at"], UTC), True, False))
                return cached["body"]
        # de-duplicate identical concurrent requests (e.g. two widgets loading the same player)
        if key in self._inflight:
            return await asyncio.shield(self._inflight[key])
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._inflight[key] = fut
        try:
            body = await self._fetch(path, params, allow_404)
            if body is not None:  # never cache "not found": e.g. /stats appears once a match finishes
                cp.write_text(json.dumps({"at": time.time(), "body": body}), "utf-8")
            record_fetch(FetchRecord(path, datetime.now(UTC), False, False))
            fut.set_result(body)
            return body
        except ProviderError as exc:
            if cp.exists() and exc.status >= 500:
                cached = json.loads(cp.read_text("utf-8"))
                record_fetch(FetchRecord(path, datetime.fromtimestamp(cached["at"], UTC), True, True))
                fut.set_result(cached["body"])
                return cached["body"]
            fut.set_exception(exc)
            fut.exception()  # mark retrieved
            raise
        finally:
            self._inflight.pop(key, None)

    async def _fetch(
        self, path: str, params: dict[str, Any] | None, allow_404: bool
    ) -> dict[str, Any] | None:
        for attempt in range(5):
            async with self._sem:
                await self._limiter.wait()
                try:
                    resp = await self._client.get(path, params=params)
                except httpx.HTTPError as exc:
                    if attempt == 4:
                        raise ProviderError(
                            f"FACEIT API недоступен ({exc.__class__.__name__})", status=503
                        ) from exc
                    await asyncio.sleep(2**attempt)
                    continue
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 404 and allow_404:
                return None
            if resp.status_code == 429 or resp.status_code >= 500:
                retry_after = float(resp.headers.get("Retry-After", 2**attempt))
                await asyncio.sleep(min(retry_after, 30))
                continue
            if resp.status_code in (401, 403):
                raise ProviderError("FACEIT API отклонил ключ (проверьте FACEIT_API_KEY)", status=502)
            if resp.status_code == 404:
                raise ProviderError("FACEIT API: объект не найден", status=404)
            raise ProviderError(f"FACEIT API вернул ошибку {resp.status_code}", status=502)
        raise ProviderError(
            "FACEIT API: превышен лимит запросов или сбой сервера, попробуйте позже", status=503
        )

    async def get_player(self, nickname: str) -> dict[str, Any]:
        data = await self._get(
            "/players", {"nickname": nickname, "game": "cs2"}, ttl=self._profile_ttl, allow_404=True
        )
        if not data:
            raise PlayerNotFound(nickname)
        return data

    async def get_player_by_id(self, player_id: str) -> dict[str, Any]:
        data = await self._get(f"/players/{player_id}", ttl=self._profile_ttl, allow_404=True)
        if not data:
            raise PlayerNotFound(player_id)
        return data

    async def get_player_by_steam(self, steam_id: str) -> dict[str, Any] | None:
        return await self._get(
            "/players", {"game": "cs2", "game_player_id": steam_id}, ttl=self._profile_ttl, allow_404=True
        )

    async def get_history(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        offset = 0
        while len(items) < limit:
            page = min(HISTORY_PAGE, limit - len(items))
            data = await self._get(
                f"/players/{player_id}/history",
                {"game": "cs2", "offset": offset, "limit": page},
                ttl=TTL_HISTORY,
            )
            batch = (data or {}).get("items", [])
            items.extend(batch)
            if len(batch) < page:
                break
            offset += page
        return items[:limit]

    async def get_lifetime_stats(self, player_id: str) -> dict[str, Any] | None:
        return await self._get(f"/players/{player_id}/stats/cs2", ttl=TTL_STATS, allow_404=True)

    async def get_recent_match_stats(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        data = await self._get(
            f"/players/{player_id}/games/cs2/stats",
            {"offset": 0, "limit": min(limit, STATS_PAGE)},
            ttl=TTL_HISTORY,
            allow_404=True,
        )
        return [it.get("stats", it) for it in (data or {}).get("items", [])]

    async def get_match(self, match_id: str) -> dict[str, Any] | None:
        def ttl(body):
            return None if str(body.get("status", "")).upper() in FINAL_STATUSES else TTL_LIVE_MATCH

        return await self._get(f"/matches/{match_id}", allow_404=True, ttl_fn=ttl)

    async def get_match_stats(self, match_id: str) -> dict[str, Any] | None:
        return await self._get(f"/matches/{match_id}/stats", allow_404=True)

    async def aclose(self) -> None:
        await self._client.aclose()


class UnconfiguredProvider:
    """Used when FACEIT_API_KEY is missing: every call fails with an explicit, actionable error."""

    name = "unconfigured"

    def source_for(self, nickname: str) -> DataSource:
        return "faceit_api"

    def __getattr__(self, item):
        if item.startswith("get_"):

            async def fail(*_a, **_k):
                from .base import ProviderNotConfigured

                raise ProviderNotConfigured()

            return fail
        raise AttributeError(item)
