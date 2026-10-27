from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..state import AppState, get_db, get_state, require_access
from ..tactical.profiles import map_points, place_centroids
from ..tactical.zones import radar_transforms

router = APIRouter(prefix="/api/maps", tags=["maps"], dependencies=[Depends(require_access)])


@router.get("/{map_name}")
def map_info(
    map_name: str,
    steam_ids: str | None = None,
    db: Session = Depends(get_db),
    state: AppState = Depends(get_state),
):
    if map_name not in radar_transforms():
        raise HTTPException(404, "Нет геометрии для этой карты")
    radar = state.settings.data_dir / "radars" / f"{map_name}.png"
    ids = [s for s in (steam_ids or "").split(",") if s][:10] or None
    return {
        "map": map_name,
        "radar_available": radar.exists(),
        "size": 1024,
        "centroids": place_centroids(db, map_name),
        "points": map_points(db, map_name, ids),
    }


@router.get("/{map_name}/radar.png")
def radar_image(map_name: str, state: AppState = Depends(get_state)):
    if map_name not in radar_transforms():
        raise HTTPException(404, "Нет такой карты")
    p: Path = state.settings.data_dir / "radars" / f"{map_name}.png"
    if not p.exists():
        raise HTTPException(404, "Радар не загружен (scripts/fetch_radars.sh)")
    return FileResponse(p, media_type="image/png")
