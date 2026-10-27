"""FastAPI application: FACEIT analytics, match scouting, accounts, demo pipeline."""

from contextlib import asynccontextmanager
from importlib.metadata import version
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, get_settings
from .providers.base import ProviderError
from .providers.faceit_api import FaceitApiProvider
from .routes import auth, coach, demos, maps, me, players, scout
from .state import build_state
from .tactical.profiles import ingest


def create_app(settings: Settings | None = None, provider: object | None = None) -> FastAPI:
    settings = settings or get_settings()
    ctx = build_state(settings, provider)

    def on_demo_done(demo_id: str, analysis: dict) -> None:
        tactical = analysis.get("tactical")
        if tactical:
            with ctx.db.session() as s:
                ingest(s, demo_id, tactical)

    ctx.demos.on_done = on_demo_done

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        ctx.demos.seed_sample(settings.sample_demos_dir)
        yield
        ctx.demos.shutdown()
        if isinstance(ctx.provider, FaceitApiProvider):
            await ctx.provider.aclose()

    app = FastAPI(title="FACEIT Intelligence API", version="0.2.0", lifespan=lifespan)
    app.state.ctx = ctx
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/"):
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    @app.exception_handler(ProviderError)
    async def provider_error(_, exc: ProviderError):
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "provider": ctx.provider.name,
            "api_key_configured": settings.api_enabled,
            "auth": {"steam": True, "faceit": settings.faceit_oauth_configured},
            "demo_parser": f"demoparser2 {version('demoparser2')}",
        }

    for r in (auth.router, me.router, players.router, demos.router, scout.router, coach.router, maps.router):
        app.include_router(r)

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(404, "Not found")
            candidate = dist / full_path
            if full_path and candidate.is_file() and dist in candidate.resolve().parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
