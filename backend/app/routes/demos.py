from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from ..auth.security import client_ip
from ..state import AppState, Auth, get_auth, get_db, get_state
from .me import log_analysis

router = APIRouter(prefix="/api/demos", tags=["demos"])
UPLOAD_SUFFIXES = (".dem", ".dem.gz", ".dem.bz2", ".dem.zst")


@router.get("")
async def list_demos(state: AppState = Depends(get_state)):
    return state.demos.list()


@router.post("", status_code=202)
async def upload_demo(
    request: Request,
    file: UploadFile = File(...),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(get_auth),
):
    state.limiter.check(f"upload:{client_ip(request)}", 10)
    name = file.filename or "demo.dem"
    if not name.lower().endswith(UPLOAD_SUFFIXES):
        raise HTTPException(400, "Нужен файл .dem (или .dem.gz / .dem.bz2 / .dem.zst)")
    demo_id, path = state.demos.create(name)
    limit = state.settings.max_demo_upload_mb * 1024 * 1024
    size = 0
    with open(path, "wb") as out:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > limit:
                out.close()
                state.demos.delete(demo_id)
                raise HTTPException(413, f"Файл больше {state.settings.max_demo_upload_mb} МБ")
            out.write(chunk)
    state.demos.submit(demo_id, path)
    return state.demos.get_meta(demo_id)


@router.get("/{demo_id}")
async def get_demo(
    demo_id: str,
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
    auth: Auth = Depends(get_auth),
):
    meta = state.demos.get_meta(demo_id)
    if meta is None:
        raise HTTPException(404, "Демо не найдено")
    if meta["status"] == "done":
        log_analysis(db, auth, "demo", demo_id, f"{meta.get('map', '')} {meta.get('score', '')}".strip())
    return {"meta": meta, "analysis": state.demos.analysis(demo_id) if meta["status"] == "done" else None}


@router.delete("/{demo_id}", status_code=204)
async def delete_demo(
    demo_id: str,
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
    auth: Auth = Depends(get_auth),
):
    from sqlalchemy import delete

    from ..db import TacticalSample

    if not state.demos.delete(demo_id):
        raise HTTPException(404, "Демо не найдено")
    db.execute(delete(TacticalSample).where(TacticalSample.demo_id == demo_id))
