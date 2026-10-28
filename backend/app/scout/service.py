"""Match Scout orchestration: gather FACEIT data for all ten players, analyse, store report + prediction."""

import asyncio
import hashlib
import json
import secrets
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from ..db import Database, Prediction, ScoutReport, utcnow
from ..providers.base import FetchRecord, ProviderError, fetch_log, freshness_summary
from ..tactical.profiles import pair_synergy, player_profiles
from . import briefing, chemistry, risk, strength
from .features import PlayerFeatures, build_features, norm_map

ALGO_VERSION = "scout-v1 (elo-baseline-v1, risk-v1, chemistry-v1)"
RECENT_N = 30
PLAYER_TIMEOUT_S = 90
# Job progress milestones: [0, PLAYERS_START) match + rosters, then players, then [BRIEFING_START, 1) briefing.
PLAYERS_START = 0.1
BRIEFING_START = 0.9


def job_stage(status: str, progress: float) -> str:
    """Which real step a scout job is in, for the UI ("match" | "players" | "briefing" | status)."""
    if status != "running":
        return status
    if progress < PLAYERS_START:
        return "match"
    return "players" if progress < BRIEFING_START else "briefing"


HISTORY_N = 30
PRE_MATCH = {"READY", "VOTING", "CONFIGURING", "SCHEDULED", "CHECK_IN", "SUBSTITUTION", "MANUAL_RESULT"}
FINISHED = {"FINISHED"}
DEAD = {"CANCELLED", "ABORTED"}

_tasks: set[asyncio.Task] = set()


async def _player_bundle(provider, roster: dict[str, Any], faction: str) -> PlayerFeatures:
    pid = roster["player_id"]
    errors = []

    async def safe(coro, label, default):
        try:
            return await asyncio.wait_for(coro, PLAYER_TIMEOUT_S)
        except ProviderError as exc:
            errors.append(f"{label}: {exc}")
        except TimeoutError:
            errors.append(f"{label}: FACEIT не ответил за {PLAYER_TIMEOUT_S} с")
        return default

    profile, lifetime, recent, history = await asyncio.gather(
        safe(provider.get_player_by_id(pid), "профиль", None),
        safe(provider.get_lifetime_stats(pid), "статистика", None),
        safe(provider.get_recent_match_stats(pid, RECENT_N), "матчи", []),
        safe(provider.get_history(pid, HISTORY_N), "история", []),
    )
    f = build_features(faction, roster, profile, lifetime, recent, history)
    f.errors = errors
    return f


def _player_view(p: PlayerFeatures, mp: str | None, threat, roles, rk, tac) -> dict[str, Any]:
    rec = p.recent_agg(20)
    return {
        "player_id": p.player_id,
        "nickname": p.nickname,
        "steam_id": p.steam_id,
        "avatar": p.avatar,
        "country": p.country,
        "elo": p.elo,
        "level": p.level,
        "account_age_days": round(p.account_age_days()) if p.account_age_days() is not None else None,
        "lifetime": {
            "matches": p.lifetime_matches,
            "win_rate": p.lifetime_win_rate,
            "kd": p.lifetime_kd,
            "hs": p.lifetime_hs,
            "adr": p.lifetime_adr,
        },
        "recent": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in rec.items()},
        "form": [
            {"match_id": m.match_id, "won": m.won, "rating": m.rating, "map": m.map} for m in p.recent[:20]
        ],
        "map_segment": p.map_segments.get(mp) if mp else None,
        "map_segments": p.map_segments,
        "threat": threat,
        "roles": roles,
        "risk": rk,
        "tactical": tac,
        "errors": p.errors,
    }


def _site_duels(team: list[PlayerFeatures], tac: dict[str, Any], mp: str) -> list[dict[str, Any]]:
    agg: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for p in team:
        prof = ((tac.get(p.steam_id or "") or {}).get("maps") or {}).get(mp)
        ct = (prof or {}).get("sides", {}).get("CT")
        for area, d in (ct or {}).get("duels_by_area", {}).items():
            if area in ("A", "B", "Mid"):
                agg[area][0] += d["wins"]
                agg[area][1] += d["losses"]
    return [
        {
            "area": a,
            "wins": w,
            "losses": lo,
            "n": w + lo,
            "win_rate": round(w / (w + lo), 2) if w + lo else None,
        }
        for a, (w, lo) in agg.items()
    ]


async def build_report(
    provider, db: Database, match_id: str, user_player_id: str | None, progress=None
) -> dict[str, Any]:
    log: list[FetchRecord] = []
    token = fetch_log.set(log)
    try:
        details = await provider.get_match(match_id)
        if not details:
            raise ProviderError("Матч не найден на FACEIT (проверьте ссылку)", status=404)
        status = str(details.get("status", "")).upper()
        factions = details.get("teams") or {}
        if not {"faction1", "faction2"} <= set(factions):
            raise ProviderError("У матча ещё нет составов команд", status=409)
        picks = ((details.get("voting") or {}).get("map") or {}).get("pick") or []
        mp = norm_map(picks[0]) if picks else None
        rosters = []
        seen: set[str] = set()
        for fk in ("faction1", "faction2"):
            for r in factions[fk].get("roster") or factions[fk].get("players") or []:
                if r.get("player_id") and r["player_id"] not in seen:  # duplicated roster entries are ignored
                    seen.add(r["player_id"])
                    rosters.append((fk, r))
        done = 0
        players: list[PlayerFeatures] = []
        if progress:
            progress(PLAYERS_START)  # match and rosters are known; per-player collection starts

        async def one(fk, r):
            nonlocal done
            f = await _player_bundle(provider, r, fk)
            done += 1
            if progress:
                progress(PLAYERS_START + (BRIEFING_START - PLAYERS_START) * done / max(1, len(rosters)))
            return f

        players = list(await asyncio.gather(*(one(fk, r) for fk, r in rosters)))
        match_stats = await provider.get_match_stats(match_id) if status in FINISHED else None
    finally:
        fetch_log.reset(token)

    by_team = {fk: [p for p in players if p.faction == fk] for fk in ("faction1", "faction2")}
    with db.session() as s:
        tac = player_profiles(s, [p.steam_id for p in players if p.steam_id], mp) if players else {}

        def demo_syn(a, b):
            if not (a.steam_id and b.steam_id):
                return None
            return pair_synergy(s, a.steam_id, b.steam_id, mp)

        pairs = {fk: chemistry.team_pairs(team, demo_syn) for fk, team in by_team.items()}
    threats = strength.threat_scores(players, mp)
    summaries = {fk: strength.team_summary(team, mp) for fk, team in by_team.items()}
    official = (factions["faction1"].get("stats") or {}).get("winProbability")
    comparison = strength.compare(summaries["faction1"], summaries["faction2"], official)
    names = {fk: factions[fk].get("name") or fk for fk in ("faction1", "faction2")}
    us = next((p.faction for p in players if p.player_id == user_player_id), None)
    them = "faction2" if us == "faction1" else "faction1"
    teams_out = {}
    for fk, team in by_team.items():
        risks = {p.player_id: risk.player_risk(p, players, pairs[fk]) for p in team}
        teams_out[fk] = {
            "name": names[fk],
            "summary": summaries[fk],
            "pairs": pairs[fk],
            "groups": chemistry.groups(pairs[fk]),
            "instability": risk.team_instability(team, pairs[fk]),
            "players": [
                _player_view(
                    p,
                    mp,
                    threats[p.player_id],
                    strength.stat_roles(p, players),
                    risks[p.player_id],
                    tac.get(p.steam_id or ""),
                )
                for p in team
            ],
        }
    pool = []
    all_maps = sorted({m for p in players for m in p.map_segments})

    def agg(team, m):
        segs = [p.map_segments.get(m) or {} for p in team]
        n = sum(s.get("matches") or 0 for s in segs)
        w = sum((s.get("win_rate") or 0) * (s.get("matches") or 0) for s in segs)
        return int(n), (round(w / n, 3) if n else None)

    for m in all_maps:
        us_k = us or "faction1"
        them_k = them if us else "faction2"
        un, uw = agg(by_team[us_k], m)
        tn, tw = agg(by_team[them_k], m)
        pool.append({"map": m, "us_matches": un, "us_win_rate": uw, "them_matches": tn, "them_win_rate": tw})
    pool.sort(key=lambda x: -x["them_matches"])
    ctx = {
        "us": us or "faction1",
        "them": them if us else "faction2",
        "a_key": "faction1",
        "teams": teams_out,
        "team_names": names,
        "comparison": comparison,
        "map": mp,
        "map_pool": pool,
        "tactical": tac,
        "site_duels": {fk: _site_duels(team, tac, mp) for fk, team in by_team.items()} if mp else {},
    }
    result = None
    if match_stats:
        rnd = (match_stats.get("rounds") or [{}])[0]
        winner = (details.get("results") or {}).get("winner")
        result = {
            "winner": winner,
            "score": (rnd.get("round_stats") or {}).get("Score"),
            "players": {
                p["player_id"]: p.get("player_stats", {})
                for t in rnd.get("teams", [])
                for p in t.get("players", [])
            },
        }
    elif status in FINISHED:
        result = {"winner": (details.get("results") or {}).get("winner"), "score": None, "players": {}}
    return {
        "match_id": match_id,
        "status": status,
        "phase": "pre"
        if status in PRE_MATCH
        else "live"
        if status == "ONGOING"
        else "post"
        if status in FINISHED
        else "dead"
        if status in DEAD
        else "unknown",
        "map": mp,
        "map_pool": pool,
        "competition": details.get("competition_name"),
        "region": details.get("region"),
        "faceit_url": (details.get("faceit_url") or "").replace("{lang}", "en") or None,
        "user_faction": us,
        "teams": teams_out,
        "comparison": comparison,
        "briefing": briefing.build(ctx),
        "result": result,
        "algo_version": ALGO_VERSION,
        "generated_at": datetime.now(UTC).isoformat(),
        "freshness": freshness_summary(log),
        "tactical_coverage": {
            "players_with_demos": sum(1 for v in tac.values() if v.get("observed")),
            "players_total": len(players),
        },
    }


def prediction_payload(report: dict[str, Any]) -> dict[str, Any]:
    cmp_ = report["comparison"]
    flags = {
        pl["player_id"]: {"classification": pl["risk"]["classification"], "score": pl["risk"]["score"]}
        for t in report["teams"].values()
        for pl in t["players"]
        if pl["risk"]["classification"]
    }
    return {
        "map": report["map"],
        "elo_expectation_faction1": cmp_["elo_expectation"],
        "official_win_probability_faction1": cmp_["official_win_probability"],
        "favoured": None
        if cmp_["elo_expectation"] is None or abs(cmp_["elo_expectation"] - 0.5) < 0.02
        else ("faction1" if cmp_["elo_expectation"] > 0.5 else "faction2"),
        "factors": cmp_["factors"],
        "uncertainty": cmp_["uncertainty"],
        "risk_flags": flags,
        "threat_top": {
            fk: sorted(t["players"], key=lambda x: x["threat"]["rank"])[0]["player_id"]
            for fk, t in report["teams"].items()
            if t["players"]
        },
        "duos": [
            {"a": p["a"], "b": p["b"], "category": p["category"]}
            for t in report["teams"].values()
            for p in t["pairs"]
            if p["category"] != "insufficient_evidence"
        ],
        "user_faction": report["user_faction"],
        "briefing": [
            {"id": b["id"], "kind": b["kind"], "category": b["category"], "text": b["text"]}
            for b in report["briefing"]
        ],
    }


def input_hash(report: dict[str, Any]) -> str:
    core = {
        fk: [(p["player_id"], p["elo"], p["recent"].get("n"), p["lifetime"]["matches"]) for p in t["players"]]
        for fk, t in report["teams"].items()
    }
    return hashlib.sha256(
        json.dumps([report["match_id"], report["map"], core], sort_keys=True).encode()
    ).hexdigest()


def start_job(state, match_id: str, user_id: int | None, user_player_id: str | None) -> str:
    sid = secrets.token_hex(6)
    with state.db.session() as s:
        s.add(ScoutReport(id=sid, match_id=match_id, user_id=user_id, status="running", progress=0.02))

    def set_progress(v: float):
        with state.db.session() as s:
            row = s.get(ScoutReport, sid)
            if row:
                row.progress = round(v, 2)

    async def run():
        try:
            report = await build_report(state.provider, state.db, match_id, user_player_id, set_progress)
            with state.db.session() as s:
                row = s.get(ScoutReport, sid)
                row.status, row.progress, row.report = "done", 1.0, report
                row.match_status, row.finished_at = report["status"], utcnow()
                if report["phase"] in ("pre", "live"):
                    exists = s.scalar(
                        select(Prediction)
                        .where(Prediction.match_id == match_id, Prediction.user_id == user_id)
                        .limit(1)
                    )
                    if exists is None:
                        oldest = report["freshness"].get("oldest")
                        s.add(
                            Prediction(
                                match_id=match_id,
                                scout_id=sid,
                                user_id=user_id,
                                match_status_at_prediction=report["status"],
                                pre_match=report["phase"] == "pre",
                                algo_version=ALGO_VERSION,
                                input_hash=input_hash(report),
                                data_as_of=datetime.fromisoformat(oldest).replace(tzinfo=None)
                                if oldest
                                else None,
                                payload=prediction_payload(report),
                            )
                        )
        except ProviderError as exc:
            _fail(state, sid, str(exc))
        except asyncio.CancelledError:
            _fail(state, sid, "Разведка прервана (остановка сервера) — запустите снова")
            raise
        except Exception as exc:  # unexpected analysis failure: keep the job inspectable
            _fail(state, sid, f"Внутренняя ошибка анализа: {exc.__class__.__name__}: {exc}")

    task = asyncio.get_running_loop().create_task(run())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return sid


def _fail(state, sid: str, msg: str) -> None:
    with state.db.session() as s:
        row = s.get(ScoutReport, sid)
        if row:
            row.status, row.error, row.finished_at = "error", msg, utcnow()
