"""Mock FACEIT Data API v4 HTTP server for integration/E2E tests. Serves world.py data with real paths,
pagination, bearer-auth check and an admin hook to finish the upcoming match.

Run:  uv run python -m tests.support.mock_faceit --port 8901
Then: FACEIT_API_BASE=http://127.0.0.1:8901/data/v4 FACEIT_API_KEY=test-key uvicorn app.main:app
"""

import argparse
import asyncio

from fastapi import FastAPI, Header, HTTPException, Request

from .world import _details, build_world, lifetime, profile


def create_mock(world=None) -> FastAPI:
    w = world or build_world()
    by_id = {p.pid: p for p in w["people"]}
    by_nick = {p.nick.lower(): p for p in w["people"]}
    by_steam = {p.steam: p for p in w["people"]}
    app = FastAPI()
    app.state.world = w
    app.state.latency_s = 0.0

    @app.middleware("http")
    async def latency(request: Request, call_next):
        # E2E only: simulate a slow FACEIT for the data API (set through /admin/latency)
        if app.state.latency_s and request.url.path.startswith("/data/"):
            await asyncio.sleep(app.state.latency_s)
        return await call_next(request)

    @app.post("/admin/latency/{ms}")
    def set_latency(ms: int):
        app.state.latency_s = max(0, ms) / 1000
        return {"latency_ms": ms}

    def auth(authorization: str | None):
        if authorization != "Bearer test-key":
            raise HTTPException(401, "bad key")

    @app.get("/data/v4/players")
    def players(
        nickname: str | None = None,
        game_player_id: str | None = None,
        authorization: str | None = Header(default=None),
    ):
        auth(authorization)
        p = by_nick.get((nickname or "").lower()) if nickname else by_steam.get(game_player_id or "")
        if not p:
            raise HTTPException(404, "not found")
        return profile(p)

    @app.get("/data/v4/players/{pid}")
    def player(pid: str, authorization: str | None = Header(default=None)):
        auth(authorization)
        if pid not in by_id:
            raise HTTPException(404)
        return profile(by_id[pid])

    @app.get("/data/v4/players/{pid}/history")
    def history(pid: str, offset: int = 0, limit: int = 20, authorization: str | None = Header(default=None)):
        auth(authorization)
        p = by_id.get(pid)
        ids = list(reversed(p.history)) if p else []
        return {
            "items": [w["history"][m] for m in ids[offset : offset + limit]],
            "start": offset,
            "end": offset + limit,
        }

    @app.get("/data/v4/players/{pid}/stats/cs2")
    def stats(pid: str, authorization: str | None = Header(default=None)):
        auth(authorization)
        if pid not in by_id:
            raise HTTPException(404)
        return lifetime(by_id[pid])

    @app.get("/data/v4/players/{pid}/games/cs2/stats")
    def game_stats(
        pid: str, offset: int = 0, limit: int = 20, authorization: str | None = Header(default=None)
    ):
        auth(authorization)
        p = by_id.get(pid)
        items = list(reversed(p.stats)) if p else []
        return {
            "items": [{"stats": s} for s in items[offset : offset + limit]],
            "start": offset,
            "end": offset + limit,
        }

    @app.get("/data/v4/matches/{mid}")
    def match(mid: str, authorization: str | None = Header(default=None)):
        auth(authorization)
        if mid not in w["details"]:
            raise HTTPException(404)
        return w["details"][mid]

    @app.get("/data/v4/matches/{mid}/stats")
    def match_stats(mid: str, authorization: str | None = Header(default=None)):
        auth(authorization)
        if mid not in w["stats"]:
            raise HTTPException(404)
        return w["stats"][mid]

    @app.get("/admin/upcoming")
    def upcoming():
        return {"match_id": w["upcoming"], "me": w["me"].nick}

    @app.post("/admin/pick/{mid}")
    async def pick(mid: str, request: Request):
        """E2E: set the map chosen in the room ({"map": "de_nuke"}) or reopen the veto ({"map": null})."""
        mp = (await request.json()).get("map")
        w["details"][mid]["voting"]["map"]["pick"] = [mp] if mp else []
        return {"map": mp}

    @app.post("/admin/finish/{mid}")
    async def finish(mid: str, request: Request):
        d = w["details"][mid]
        a = [by_id[r["player_id"]] for r in d["teams"]["faction1"]["roster"]]
        b = [by_id[r["player_id"]] for r in d["teams"]["faction2"]["roster"]]
        body = await request.json() if (await request.body()) else {}
        winner = body.get("winner", "faction2")
        nd = _details(
            mid,
            a,
            b,
            __import__("datetime").datetime.now(__import__("datetime").UTC),
            "de_mirage",
            "FINISHED",
            winner,
            {"faction1": int(winner == "faction1"), "faction2": int(winner == "faction2")},
        )
        w["details"][mid] = nd
        teams = []
        for fk, team in (("faction1", a), ("faction2", b)):
            teams.append(
                {
                    "team_id": team[0].pid,
                    "players": [
                        {
                            "player_id": q.pid,
                            "nickname": q.nick,
                            "player_stats": {
                                "Kills": "30" if q.nick == "planted_smurf" else "15",
                                "Deaths": "12",
                                "ADR": "130" if q.nick == "planted_smurf" else "75",
                                "Result": "1" if fk == winner else "0",
                            },
                        }
                        for q in team
                    ],
                }
            )
        w["stats"][mid] = {
            "rounds": [
                {"round_stats": {"Map": "de_mirage", "Score": "13 / 9", "Rounds": "22"}, "teams": teams}
            ]
        }
        return {"ok": True}

    return app


if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8901)
    args = ap.parse_args()
    uvicorn.run(create_mock(), host="127.0.0.1", port=args.port, log_level="warning")
