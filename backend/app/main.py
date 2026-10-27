"""FastAPI application: FACEIT analytics + CS2 demo pipeline."""

from contextlib import asynccontextmanager
from importlib.metadata import version
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .analytics import elo, insights, matchmaking, player
from .config import get_settings
from .demo.store import DemoStore
from .domain import PlayerDataset
from .providers.base import ProviderError
from .providers.faceit_api import FaceitApiProvider
from .providers.fixtures import FixtureProvider
from .services.players import load_elo_snapshots, load_player_dataset

settings = get_settings()
fixtures = FixtureProvider(settings.fixtures_dir)
provider = (
    FaceitApiProvider(
        settings.faceit_api_key.get_secret_value(),
        settings.faceit_api_base,
        settings.data_dir / "api_cache",
        settings.faceit_requests_per_second,
        settings.faceit_max_concurrency,
    )
    if settings.api_enabled
    else fixtures
)
demos = DemoStore(settings.data_dir / "demos")
UPLOAD_SUFFIXES = (".dem", ".dem.gz", ".dem.bz2", ".dem.zst")


@asynccontextmanager
async def lifespan(_: FastAPI):
    demos.seed_sample(settings.sample_demos_dir)
    yield
    demos.shutdown()
    if isinstance(provider, FaceitApiProvider):
        await provider.aclose()


app = FastAPI(title="FACEIT Intelligence API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"]
)


@app.exception_handler(ProviderError)
async def provider_error(_, exc: ProviderError):
    return JSONResponse(status_code=exc.status, content={"detail": str(exc)})


async def _dataset(nickname: str, limit: int) -> PlayerDataset:
    # Fixture datasets stay reachable in API mode so the demo data never disappears.
    if provider is not fixtures and nickname.lower() in fixtures._player_index:
        return await load_player_dataset(fixtures, nickname, limit, settings.data_dir)
    return await load_player_dataset(provider, nickname, limit, settings.data_dir)


Limit = Annotated[int, Query(ge=5, le=300)]


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "provider": provider.name,
        "api_key_configured": settings.api_enabled,
        "demo_parser": f"demoparser2 {version('demoparser2')}",
    }


@app.get("/api/datasets")
async def datasets():
    return {"provider": provider.name, "datasets": fixtures.datasets()}


@app.get("/api/players/{nickname}/overview")
async def player_overview(nickname: str, limit: Limit = 100):
    ds = await _dataset(nickname, limit)
    return {"profile": ds.profile, "quality": ds.quality, **player.overview(ds)}


@app.get("/api/players/{nickname}/best-worst")
async def player_best_worst(nickname: str, limit: Limit = 100):
    return player.best_worst(await _dataset(nickname, limit))


@app.get("/api/players/{nickname}/insights")
async def player_insights(nickname: str, limit: Limit = 100):
    return insights.compute_insights(await _dataset(nickname, limit))


@app.get("/api/players/{nickname}/elo")
async def player_elo(nickname: str, limit: Limit = 100):
    ds = await _dataset(nickname, limit)
    return elo.elo_report(ds, load_elo_snapshots(settings.data_dir, ds.profile.player_id))


@app.get("/api/players/{nickname}/matchmaking")
async def player_matchmaking(nickname: str, limit: Limit = 100):
    return matchmaking.analyze(await _dataset(nickname, limit))


@app.get("/api/players/{nickname}/matches/{match_id}")
async def player_match(nickname: str, match_id: str, limit: Limit = 100):
    ds = await _dataset(nickname, limit)
    pm = next((m for m in ds.matches if m.match.match_id == match_id), None)
    if pm is None:
        raise HTTPException(404, "Матч не найден в загруженной истории игрока")
    return {
        "row": player.match_row(pm),
        "match": pm.match,
        "team_index": pm.team_index,
        "player_id": ds.profile.player_id,
    }


@app.get("/api/demos")
async def list_demos():
    return demos.list()


@app.post("/api/demos", status_code=202)
async def upload_demo(file: UploadFile = File(...)):
    name = file.filename or "demo.dem"
    if not name.lower().endswith(UPLOAD_SUFFIXES):
        raise HTTPException(400, "Нужен файл .dem (или .dem.gz / .dem.bz2 / .dem.zst)")
    demo_id, path = demos.create(name)
    limit = settings.max_demo_upload_mb * 1024 * 1024
    size = 0
    with open(path, "wb") as out:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > limit:
                out.close()
                demos.delete(demo_id)
                raise HTTPException(413, f"Файл больше {settings.max_demo_upload_mb} МБ")
            out.write(chunk)
    demos.submit(demo_id, path)
    return demos.get_meta(demo_id)


@app.get("/api/demos/{demo_id}")
async def get_demo(demo_id: str):
    meta = demos.get_meta(demo_id)
    if meta is None:
        raise HTTPException(404, "Демо не найдено")
    return {"meta": meta, "analysis": demos.analysis(demo_id) if meta["status"] == "done" else None}


@app.delete("/api/demos/{demo_id}", status_code=204)
async def delete_demo(demo_id: str):
    if not demos.delete(demo_id):
        raise HTTPException(404, "Демо не найдено")


# Production: serve the built SPA from the same origin.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        candidate = _dist / full_path
        if full_path and candidate.is_file() and _dist in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
