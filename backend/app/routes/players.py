from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..analytics import elo, insights, matchmaking, player
from ..domain import PlayerDataset
from ..services.players import load_player_dataset, load_snapshots
from ..state import AppState, Auth, get_db, get_state, require_access
from .me import log_analysis

router = APIRouter(prefix="/api/players", tags=["players"], dependencies=[Depends(require_access)])
Limit = Annotated[int, Query(ge=5, le=300)]


async def dataset(state: AppState, nickname: str, limit: int) -> PlayerDataset:
    return await load_player_dataset(state.provider, nickname, limit, state.settings.data_dir, state.db)


@router.get("/{nickname}/overview")
async def overview(
    nickname: str,
    limit: Limit = 100,
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
    auth: Auth = Depends(require_access),
):
    ds = await dataset(state, nickname, limit)
    log_analysis(db, auth, "player", ds.profile.nickname, ds.profile.nickname)
    return {"profile": ds.profile, "quality": ds.quality, **player.overview(ds)}


@router.get("/{nickname}/best-worst")
async def best_worst(nickname: str, limit: Limit = 100, state: AppState = Depends(get_state)):
    return player.best_worst(await dataset(state, nickname, limit))


@router.get("/{nickname}/insights")
async def player_insights(nickname: str, limit: Limit = 100, state: AppState = Depends(get_state)):
    return insights.compute_insights(await dataset(state, nickname, limit))


@router.get("/{nickname}/elo")
async def player_elo(nickname: str, limit: Limit = 100, state: AppState = Depends(get_state)):
    ds = await dataset(state, nickname, limit)
    return elo.elo_report(ds, load_snapshots(state.db, ds.profile.player_id))


@router.get("/{nickname}/matchmaking")
async def player_matchmaking(nickname: str, limit: Limit = 100, state: AppState = Depends(get_state)):
    return matchmaking.analyze(await dataset(state, nickname, limit))


@router.get("/{nickname}/matches/{match_id}")
async def player_match(
    nickname: str, match_id: str, limit: Limit = 100, state: AppState = Depends(get_state)
):
    ds = await dataset(state, nickname, limit)
    pm = next((m for m in ds.matches if m.match.match_id == match_id), None)
    if pm is None:
        raise HTTPException(404, "Матч не найден в загруженной истории игрока")
    return {
        "row": player.match_row(pm),
        "match": pm.match,
        "team_index": pm.team_index,
        "player_id": ds.profile.player_id,
    }
