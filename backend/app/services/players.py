"""Assemble a PlayerDataset from any provider."""

import asyncio
import json
import time
from datetime import UTC, datetime
from pathlib import Path

from ..analytics.party import infer_parties
from ..domain import DataQuality, PlayerDataset, PlayerMatch
from ..faceit_normalize import build_match, normalize_profile
from ..providers.base import FaceitProvider

_CACHE: dict[tuple[str, str, int], tuple[float, PlayerDataset]] = {}
_CACHE_TTL = 120.0


def _record_elo_snapshot(data_dir: Path, player_id: str, elo: int) -> None:
    """Official Elo is only available as a current value; we keep our own time series of observations."""
    path = data_dir / "elo_snapshots" / f"{player_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    snaps = json.loads(path.read_text("utf-8")) if path.exists() else []
    now = datetime.now(UTC).isoformat()
    if not snaps or snaps[-1]["elo"] != elo:
        snaps.append({"at": now, "elo": elo})
        path.write_text(json.dumps(snaps), "utf-8")


def load_elo_snapshots(data_dir: Path, player_id: str) -> list[dict]:
    path = data_dir / "elo_snapshots" / f"{player_id}.json"
    return json.loads(path.read_text("utf-8")) if path.exists() else []


async def load_player_dataset(
    provider: FaceitProvider, nickname: str, limit: int, data_dir: Path
) -> PlayerDataset:
    key = (provider.name, nickname.lower(), limit)
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]

    raw_profile = await provider.get_player(nickname)
    profile = normalize_profile(raw_profile)
    history = await provider.get_history(profile.player_id, limit)

    async def fetch(item: dict) -> tuple[dict, dict | None, dict | None]:
        details, stats = await asyncio.gather(
            provider.get_match(item["match_id"]), provider.get_match_stats(item["match_id"])
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
    if profile.elo is not None and source == "faceit_api":
        _record_elo_snapshot(data_dir, profile.player_id, profile.elo)

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
    _CACHE[key] = (time.time(), ds)
    return ds


def chronological(ds: PlayerDataset) -> list[PlayerMatch]:
    """History is newest-first; analytics that need order use oldest-first."""
    return list(reversed(ds.matches))
