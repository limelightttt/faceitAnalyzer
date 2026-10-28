import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from ..auth.security import client_ip
from ..state import AppState, Auth, get_db, get_state, require_access
from .me import log_analysis

router = APIRouter(prefix="/api/demos", tags=["demos"])
# only the last extension counts ("match.dem (1).zst" is a repeat download); the content is checked on unpack
UPLOAD_SUFFIXES = (".dem", ".gz", ".bz2", ".zst")


def _uid(auth: Auth) -> int | None:
    return auth.user.id if auth.user else None


@router.get("")
async def list_demos(state: AppState = Depends(get_state), auth: Auth = Depends(require_access)):
    return state.demos.list(_uid(auth))


@router.post("", status_code=202)
async def upload_demo(
    request: Request,
    file: UploadFile = File(...),
    state: AppState = Depends(get_state),
    auth: Auth = Depends(require_access),
):
    state.limiter.check(f"upload:{_uid(auth) or client_ip(request)}", 10)
    limit = state.settings.max_demo_upload_mb * 1024 * 1024
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit + 1024 * 1024:
        raise HTTPException(413, f"Файл больше {state.settings.max_demo_upload_mb} МБ")
    name = file.filename or "demo.dem"
    if not name.lower().endswith(UPLOAD_SUFFIXES):
        raise HTTPException(400, "Нужен файл .dem (или .dem.gz / .dem.bz2 / .dem.zst)")
    demo_id, path = state.demos.create(name, _uid(auth))
    size = 0
    digest = hashlib.sha256()
    try:
        with open(path, "wb") as out:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Файл больше {state.settings.max_demo_upload_mb} МБ")
                digest.update(chunk)
                out.write(chunk)
    except BaseException:
        state.demos.delete(demo_id)
        raise
    if size == 0:
        state.demos.delete(demo_id)
        raise HTTPException(400, "Пустой файл")
    sha = digest.hexdigest()
    existing = state.demos.find_by_hash(sha, _uid(auth))
    if existing:  # same file again: no second parse, no duplicated tactical evidence
        state.demos.delete(demo_id)
        return {**existing, "duplicate": True}
    state.demos.submit(demo_id, path, sha)
    return state.demos.get_meta(demo_id)


def _visible_meta(state: AppState, auth: Auth, demo_id: str):
    meta = state.demos.get_meta(demo_id)
    if meta is None or not state.demos.visible(meta, _uid(auth)):
        raise HTTPException(404, "Демо не найдено")
    return meta


@router.get("/{demo_id}")
async def get_demo(
    demo_id: str,
    state: AppState = Depends(get_state),
    db=Depends(get_db),
    auth: Auth = Depends(require_access),
):
    meta = _visible_meta(state, auth, demo_id)
    if meta["status"] == "done":
        log_analysis(db, auth, "demo", demo_id, f"{meta.get('map', '')} {meta.get('score', '')}".strip())
    return {"meta": meta, "analysis": state.demos.analysis(demo_id) if meta["status"] == "done" else None}


@router.delete("/{demo_id}", status_code=204)
async def delete_demo(
    demo_id: str, state: AppState = Depends(get_state), auth: Auth = Depends(require_access)
):
    meta = _visible_meta(state, auth, demo_id)
    if meta.get("source") == "sample":
        raise HTTPException(403, "Встроенный пример удалить нельзя")
    state.demos.delete(demo_id)
