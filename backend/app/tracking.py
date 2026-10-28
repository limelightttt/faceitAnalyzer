"""Background jobs inside the API process (a handful of users, so no task queue):
* Elo tracking: record real FACEIT Elo/level of every linked user's game profile; one cached profile request
  each; snapshots are deduplicated in record_snapshot, only real changes create rows.
* Prediction checks: compare pending pre-match predictions with finished matches, so the "Прогнозы" page
  fills itself instead of waiting for a button press.
Both skip their run entirely while FACEIT asks us to back off (429 cooldown).
"""

import asyncio
import logging

from sqlalchemy import select

from .db import Database, GameProfile
from .faceit_normalize import normalize_profile
from .predictions import resolve_pending
from .providers.base import ProviderError
from .services.players import record_snapshot

log = logging.getLogger("faceit_intelligence.tracking")


def _limited(provider) -> bool:
    return bool(provider.rate_limit_status()["limited"]) if hasattr(provider, "rate_limit_status") else False


async def run_once(provider, db: Database, pause_s: float = 1.0) -> dict[str, int]:
    stats = {"players": 0, "new": 0, "confirmed": 0, "errors": 0, "skipped_rate_limit": 0}
    with db.session() as s:
        ids = sorted({gp.faceit_player_id for gp in s.scalars(select(GameProfile))})
    for pid in ids:
        if _limited(provider):
            stats["skipped_rate_limit"] += len(ids) - stats["players"]
            break
        stats["players"] += 1
        try:
            prof = normalize_profile(await provider.get_player_by_id(pid))
        except ProviderError as exc:
            stats["errors"] += 1
            log.warning("tracking %s failed: %s", pid, exc)
            continue
        stats[record_snapshot(db, prof.player_id, prof.elo, prof.skill_level)] += 1
        await asyncio.sleep(pause_s)
    return stats


async def check_predictions(provider, db: Database) -> dict[str, int]:
    if _limited(provider):
        return {"checked": 0, "resolved": 0, "skipped_rate_limit": 1}
    return await resolve_pending(db, provider, None)


async def every(name: str, interval_s: float, job, first_delay_s: float = 30.0) -> None:
    """Run `job()` forever with a pause between runs; a failing run is logged, never fatal."""
    await asyncio.sleep(first_delay_s)
    while True:
        try:
            log.info("%s: %s", name, await job())
        except Exception:  # never let a background job kill the app
            log.exception("%s crashed", name)
        await asyncio.sleep(interval_s)
