"""FastAPI application: FACEIT analytics, match scouting, accounts, demo pipeline."""

import asyncio
import logging
from contextlib import asynccontextmanager
from importlib.metadata import version
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, HTTPException
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, select
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import tracking
from .config import Settings, get_settings
from .db import ScoutReport, TacticalSample
from .providers.base import ProviderError
from .providers.faceit_api import FaceitApiProvider
from .routes import auth, coach, demos, maps, me, players, scout
from .state import build_state
from .tactical.profiles import fingerprint, ingest

log = logging.getLogger("faceit_intelligence")


def create_app(settings: Settings | None = None, provider: object | None = None) -> FastAPI:
    settings = settings or get_settings()
    ctx = build_state(settings, provider)

    def on_demo_done(demo_id: str, analysis: dict) -> None:
        tactical = analysis.get("tactical")
        if tactical and tactical.get("samples"):
            with ctx.db.session() as s:
                ingest(s, fingerprint(tactical), tactical)

    def on_demo_delete(demo_id: str, analysis: dict) -> None:
        tactical = analysis.get("tactical")
        if not tactical or not tactical.get("samples"):
            return
        key = fingerprint(tactical)
        still_used = any(
            fingerprint((ctx.demos.analysis(m["id"]) or {}).get("tactical") or {}) == key
            for m in ctx.demos.all_done()
        )
        if not still_used:
            with ctx.db.session() as s:
                s.execute(delete(TacticalSample).where(TacticalSample.demo_id == key))

    ctx.demos.on_done = on_demo_done
    ctx.demos.on_delete = on_demo_delete

    def rebuild_tactical_once() -> None:
        """Data migration: tactical samples were keyed by upload id, so re-uploads of one match were counted
        twice. Rebuild them keyed by content fingerprint from the stored analyses (raw demos are not needed)."""
        if ctx.db.meta_get("tactical_keying") == "fingerprint-v1":
            return
        with ctx.db.session() as s:
            s.execute(delete(TacticalSample))
        for m in ctx.demos.all_done():
            on_demo_done(m["id"], ctx.demos.analysis(m["id"]) or {})
        ctx.db.meta_set("tactical_keying", "fingerprint-v1")

    def fail_interrupted_scouts() -> None:
        with ctx.db.session() as s:
            for row in s.scalars(select(ScoutReport).where(ScoutReport.status == "running")):
                row.status, row.error = "error", "Разведка прервана перезапуском сервера — запустите снова"

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        fail_interrupted_scouts()
        ctx.demos.seed_sample(settings.sample_demos_dir)
        rebuild_tactical_once()
        tracker = None
        if settings.tracking_interval_minutes > 0 and isinstance(ctx.provider, FaceitApiProvider):
            tracker = asyncio.get_running_loop().create_task(
                tracking.loop(ctx.provider, ctx.db, settings.tracking_interval_minutes * 60)
            )
        yield
        if tracker:
            tracker.cancel()
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
        headers = {}
        if getattr(exc, "retry_at", None):
            import time as _t

            headers["Retry-After"] = str(max(1, int(exc.retry_at - _t.time())))
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)}, headers=headers)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc: StarletteHTTPException):
        # Browser navigations that end in an auth error (OAuth/OpenID callbacks) go back to the app with a
        # readable message instead of a raw JSON page.
        path = request.url.path
        if (
            path.startswith("/api/auth/")
            and path.endswith(("/callback", "/start"))
            and "text/html" in request.headers.get("accept", "")
        ):
            return RedirectResponse(f"/?auth_error={quote(str(exc.detail))}", status_code=303)
        return await http_exception_handler(request, exc)

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc: Exception):
        log.exception("Unhandled error on %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"Внутренняя ошибка сервера ({exc.__class__.__name__}). Подробности в логе backend."
            },
        )

    @app.get("/api/health")
    async def health():
        return {
            "status": "ok",
            "provider": ctx.provider.name,
            "rate_limit": ctx.provider.rate_limit_status()
            if hasattr(ctx.provider, "rate_limit_status")
            else None,
            "api_key_configured": settings.api_enabled,
            "auth": {"steam": True, "faceit": settings.faceit_oauth_configured},
            "require_login": settings.require_login,
            "private_beta": bool(settings.beta_allowlist.strip()),
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
