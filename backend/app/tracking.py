"""Player tracking: periodically record real FACEIT Elo/level of every linked user's game profile.

Deliberately simple (an asyncio loop inside the API process): a handful of users, one profile request each
per run (cached 10 min by the provider), skipped entirely while FACEIT asks us to back off (429 cooldown).
Snapshots are deduplicated in record_snapshot: only real changes create rows.
"""

import asyncio
import logging

from sqlalchemy import select

from .db import Database, GameProfile
from .faceit_normalize import normalize_profile
from .providers.base import ProviderError
from .services.players import record_snapshot

log = logging.getLogger("faceit_intelligence.tracking")


async def run_once(provider, db: Database, pause_s: float = 1.0) -> dict[str, int]:
    stats = {"players": 0, "new": 0, "confirmed": 0, "errors": 0, "skipped_rate_limit": 0}
    with db.session() as s:
        ids = sorted({gp.faceit_player_id for gp in s.scalars(select(GameProfile))})
    for pid in ids:
        rl = provider.rate_limit_status() if hasattr(provider, "rate_limit_status") else {"limited": False}
        if rl["limited"]:
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


async def loop(provider, db: Database, interval_s: float, first_delay_s: float = 30.0) -> None:
    await asyncio.sleep(first_delay_s)
    while True:
        try:
            log.info("tracking run: %s", await run_once(provider, db))
        except Exception:  # never let the tracker kill the app
            log.exception("tracking run crashed")
        await asyncio.sleep(interval_s)
