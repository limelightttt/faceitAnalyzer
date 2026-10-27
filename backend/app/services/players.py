"""Assemble a PlayerDataset from any provider."""

import asyncio
import time
from pathlib import Path

from ..analytics.party import infer_parties
from ..domain import DataQuality, PlayerDataset, PlayerMatch
from ..faceit_normalize import build_match, normalize_profile
from ..providers.base import FaceitProvider, FetchRecord, ProviderError, fetch_log, freshness_summary

_CACHE: dict[tuple[str, str, int], tuple[float, PlayerDataset]] = {}
_CACHE_TTL = 120.0


def record_snapshot(
    db, player_id: str, elo: int | None, level: int | None, matches: int | None = None
) -> None:
    """Official Elo is only available as a current value; we keep our own time series of observations."""
    if db is None or elo is None:
        return
    from sqlalchemy import select

    from ..db import PlayerSnapshot, utcnow

    with db.session() as s:
        last = s.scalar(
            select(PlayerSnapshot)
            .where(PlayerSnapshot.player_id == player_id)
            .order_by(PlayerSnapshot.taken_at.desc())
            .limit(1)
        )
        if last and last.elo == elo and (utcnow() - last.taken_at).total_seconds() < 3600:
            return
        s.add(PlayerSnapshot(player_id=player_id, elo=elo, level=level, matches=matches))


def load_snapshots(db, player_id: str) -> list[dict]:
    if db is None:
        return []
    from sqlalchemy import select

    from ..db import PlayerSnapshot

    with db.session() as s:
        rows = s.scalars(
            select(PlayerSnapshot)
            .where(PlayerSnapshot.player_id == player_id)
            .order_by(PlayerSnapshot.taken_at)
        ).all()
        return [{"at": r.taken_at.isoformat() + "Z", "elo": r.elo, "level": r.level} for r in rows]


async def load_player_dataset(
    provider: FaceitProvider, nickname: str, limit: int, data_dir: Path, db=None
) -> PlayerDataset:
    key = (provider.name, nickname.lower(), limit)
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    log: list[FetchRecord] = []
    token = fetch_log.set(log)
    try:
        ds = await _load(provider, nickname, limit, db)
    finally:
        fetch_log.reset(token)
    ds.quality.freshness = freshness_summary(log)
    if ds.quality.freshness.get("stale"):
        ds.quality.notes.insert(
            0,
            "FACEIT API сейчас недоступен — показаны сохранённые ранее данные "
            f"(самые старые от {ds.quality.freshness['oldest'][:16].replace('T', ' ')} UTC)",
        )
    if not any(n.startswith("Часть данных матчей не загружена") for n in ds.quality.notes):
        _CACHE[key] = (time.time(), ds)
    return ds


async def _load(provider: FaceitProvider, nickname: str, limit: int, db) -> PlayerDataset:

    raw_profile = await provider.get_player(nickname)
    profile = normalize_profile(raw_profile)
    history = await provider.get_history(profile.player_id, limit)

    skipped: list[str] = []

    async def fetch(item: dict) -> tuple[dict, dict | None, dict | None]:
        async def one(coro):
            try:
                return await coro
            except ProviderError as exc:  # e.g. rate limit mid-way: keep what we have, report the gap
                skipped.append(str(exc))
                return None

        details, stats = await asyncio.gather(
            one(provider.get_match(item["match_id"])), one(provider.get_match_stats(item["match_id"]))
        )
        return item, details, stats

    fetched = await asyncio.gather(*(fetch(it) for it in history))
    source = provider.source_for(nickname)
    notes: list[str] = []
    matches: list[PlayerMatch] = []
    for item, details, stats in fetched:
        if item.get("status", "finished").lower() not in ("finished",):
            continue
        m = build_match(item["match_id"], item, details, stats)
        idx = next(
            (i for i, t in enumerate(m.teams) if any(p.player_id == profile.player_id for p in t.players)),
            None,
        )
        if idx is None or len(m.teams) != 2:
            notes.append(f"{item['match_id']}: игрок не найден в составах — матч пропущен")
            continue
        team, opp = m.teams[idx], m.teams[1 - idx]
        me = next(p for p in team.players if p.player_id == profile.player_id)
        won = None if m.winner_team_id is None else m.winner_team_id == team.team_id
        wp = team.win_probability
        if wp is None and team.avg_elo is not None and opp.avg_elo is not None:
            wp = 1.0 / (1.0 + 10 ** ((opp.avg_elo - team.avg_elo) / 400.0))
        matches.append(
            PlayerMatch(
                match=m,
                team_index=idx,
                won=won,
                stats=me.stats,
                team_avg_elo=team.avg_elo,
                opp_avg_elo=opp.avg_elo,
                win_probability=wp,
                party_size=1,
                score_for=team.score,
                score_against=opp.score,
            )
        )

    infer_parties(matches, profile.player_id)
    if source == "faceit_api":
        record_snapshot(db, profile.player_id, profile.elo, profile.skill_level)

    if skipped:
        notes.insert(0, f"Часть данных матчей не загружена ({len(skipped)} запросов): {skipped[0]}")
    has_ts = any(pm.match.started_at for pm in matches)
    has_elo = any(pm.team_avg_elo is not None for pm in matches)
    if not has_ts:
        notes.append(
            "Нет времени начала матчей: тренды строятся по порядку матчей, анализ времени суток недоступен"
        )
    if not has_elo:
        notes.append(
            "Нет среднего Elo команд (/matches/{id}): калибровка, качество соперников и прогноз Elo ограничены"
        )
    if profile.elo is None:
        notes.append("Официальный текущий Elo недоступен в этом источнике данных")
    if source == "synthetic":
        notes.append(
            "СИНТЕТИЧЕСКИЕ данные: сгенерированы скриптом в формате FACEIT API для демонстрации, не реальные матчи"
        )
    if source == "real_snapshot":
        notes.append(
            "Реальный снимок FACEIT /matches/{id}/stats из старого бота (без профиля, истории и Elo)"
        )

    ds = PlayerDataset(
        profile=profile,
        matches=matches,
        quality=DataQuality(
            source=source,
            matches_requested=limit,
            matches_loaded=len(matches),
            matches_with_stats=sum(1 for pm in matches if pm.stats),
            has_timestamps=has_ts,
            has_team_elo=has_elo,
            has_official_elo=profile.elo is not None,
            notes=notes,
        ),
    )
    return ds


def chronological(ds: PlayerDataset) -> list[PlayerMatch]:
    """History is newest-first; analytics that need order use oldest-first."""
    return list(reversed(ds.matches))
