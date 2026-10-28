"""Map pool for a duo or stack of FACEIT players."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query

from ..scout.service import player_bundle
from ..scout.stack import stack_map_pool
from ..state import AppState, get_state, require_access

router = APIRouter(prefix="/api/stack", tags=["stack"], dependencies=[Depends(require_access)])
MAX_PLAYERS = 5
WINDOW = 100  # recent matches / history per player: enough shared games to say something about a duo


@router.get("/maps")
async def stack_maps(players: str = Query(max_length=200), state: AppState = Depends(get_state)):
    nicks = list(dict.fromkeys(n.strip() for n in players.split(",") if n.strip()))
    if not 1 <= len(nicks) <= MAX_PLAYERS:
        raise HTTPException(400, f"Укажите от 1 до {MAX_PLAYERS} ников через запятую")
    profiles = await asyncio.gather(*(state.provider.get_player(n) for n in nicks))
    if len({p["player_id"] for p in profiles}) < len(profiles):
        raise HTTPException(400, "Один и тот же игрок указан дважды")
    bundles = await asyncio.gather(
        *(
            player_bundle(
                state.provider,
                {"player_id": p["player_id"], "nickname": p.get("nickname")},
                "stack",
                WINDOW,
                WINDOW,
            )
            for p in profiles
        )
    )
    return stack_map_pool(list(bundles))
