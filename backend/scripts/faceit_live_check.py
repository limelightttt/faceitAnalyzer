"""Live verification against the real FACEIT Data API (run locally where FACEIT_API_KEY is configured).

    uv run python scripts/faceit_live_check.py <your_nickname> [matchroom_url]

Checks every endpoint the app uses, validates the fields our normalizers rely on, and (optionally) builds a
full Match Scout report for a real matchroom. Prints no secrets. Paste the output into an issue/chat if
anything is marked FAIL.
"""

import asyncio
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.db import Database  # noqa: E402
from app.providers.base import ProviderError  # noqa: E402
from app.providers.faceit_api import FaceitApiProvider  # noqa: E402
from app.scout.features import build_features  # noqa: E402
from app.scout.service import build_report  # noqa: E402
from app.scout.url import parse_match_ref  # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    RESULTS.append((name, cond, detail))
    print(f"{'PASS' if cond else 'FAIL'}  {name}  {detail}")


async def main(nick: str, room: str | None) -> None:
    s = get_settings()
    if not s.api_enabled:
        sys.exit("FACEIT_API_KEY не задан (backend/.env)")
    tmp = Path(tempfile.mkdtemp())
    api = FaceitApiProvider(s.faceit_api_key.get_secret_value(), s.faceit_api_base, tmp / "cache", 4, 4)
    try:
        p = await api.get_player(nick)
        cs2 = (p.get("games") or {}).get("cs2") or {}
        check(
            "GET /players?nickname",
            bool(p.get("player_id")),
            f"elo={cs2.get('faceit_elo')} level={cs2.get('skill_level')}",
        )
        check("profile has activated_at", "activated_at" in p, str(p.get("activated_at")))
        check("profile has cs2.game_player_id (SteamID)", bool(cs2.get("game_player_id")))
        pid = p["player_id"]
        by_id = await api.get_player_by_id(pid)
        check("GET /players/{id}", by_id.get("player_id") == pid)
        if cs2.get("game_player_id"):
            by_steam = await api.get_player_by_steam(cs2["game_player_id"])
            check(
                "GET /players?game_player_id (Steam -> FACEIT)",
                bool(by_steam) and by_steam.get("player_id") == pid,
            )
        lt = await api.get_lifetime_stats(pid)
        check(
            "GET /players/{id}/stats/cs2",
            bool(lt and lt.get("lifetime")),
            f"lifetime keys: {sorted((lt or {}).get('lifetime', {}))[:12]}",
        )
        segs = (lt or {}).get("segments") or []
        check(
            "lifetime segments (maps)",
            bool(segs),
            f"labels: {[x.get('label') for x in segs][:6]} types: {sorted({x.get('type') for x in segs})}",
        )
        rec = await api.get_recent_match_stats(pid, 30)
        check(
            "GET /players/{id}/games/cs2/stats",
            bool(rec),
            f"{len(rec)} items; keys: {sorted(rec[0])[:18] if rec else []}",
        )
        hist = await api.get_history(pid, 30)
        check(
            "GET /players/{id}/history",
            bool(hist),
            f"{len(hist)} items; statuses: {sorted({h.get('status') for h in hist})}",
        )
        f = build_features("faction1", {"player_id": pid, "nickname": nick}, by_id, lt, rec, hist)
        agg = f.recent_agg(20)
        check(
            "features: recent rating/ADR computed",
            agg.get("rating") is not None and agg.get("adr") is not None,
            f"rating={agg.get('rating')} adr={agg.get('adr')} kd={agg.get('kd')} n={agg.get('n')}",
        )
        check("features: map segments parsed", bool(f.map_segments), str(list(f.map_segments)[:7]))
        mid = parse_match_ref(room) if room else (hist[0]["match_id"] if hist else None)
        if mid:
            d = await api.get_match(mid)
            check("GET /matches/{id}", bool(d), f"status={d.get('status') if d else None}")
            fac = (d or {}).get("teams", {}).get("faction1", {})
            check(
                "match roster present",
                bool(fac.get("roster")),
                f"roster fields: {sorted((fac.get('roster') or [{}])[0])}",
            )
            check("match team stats (rating/winProbability)", "stats" in fac, str(fac.get("stats")))
            rep = await build_report(api, Database(f"sqlite:///{tmp}/live.db"), mid, pid)
            check(
                "Match Scout report built",
                bool(rep["teams"]),
                f"phase={rep['phase']} map={rep['map']} elo_exp={rep['comparison']['elo_expectation']} "
                f"requests={rep['freshness']['requests']} briefing={len(rep['briefing'])}",
            )
            missing = [x for t in rep["teams"].values() for x in t["summary"]["players_missing_data"]]
            check("all 10 players loaded without errors", not missing, f"missing: {missing}")
            flagged = [
                pl["nickname"] + ": " + pl["risk"]["label"]
                for t in rep["teams"].values()
                for pl in t["players"]
                if pl["risk"]["classification"]
            ]
            print("risk flags:", flagged or "нет")
    except ProviderError as exc:
        check("FACEIT API call", False, str(exc))
    finally:
        await api.aclose()
    print(f"\n{sum(ok for _, ok, _ in RESULTS)}/{len(RESULTS)} checks passed")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
