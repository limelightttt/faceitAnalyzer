"""CS2 .dem -> normalized events, using demoparser2 (Rust parser, MIT).

The binary format is handled entirely by demoparser2; this module only selects events/props and turns
them into plain, serializable records with round numbers and sides resolved.
"""

import bz2
import gzip
import shutil
from dataclasses import asdict, dataclass, field
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from demoparser2 import DemoParser

SIDE = {2: "T", 3: "CT"}
POST_ROUND_TICKS_FALLBACK = 7 * 64
# Seconds after freeze end at which positions are sampled: setup (early), mid-round, late.
PHASE_OFFSETS_S = {"early": 12, "mid": 28, "late": 50}


class DemoParseError(Exception):
    pass


@dataclass
class RoundRaw:
    number: int
    start_tick: int  # previous round boundary (exclusive)
    freeze_end_tick: int
    end_tick: int  # round_end event
    boundary_tick: int  # official end (events up to here belong to this round)
    winner_side: str
    reason: int


@dataclass
class NormalizedDemo:
    header: dict[str, Any]
    parser_version: str
    tickrate: float
    match_start_tick: int
    last_tick: int
    players: dict[str, str]
    rounds: list[RoundRaw]
    sides: dict[int, dict[str, str]]  # round -> steamid -> T/CT
    equip: dict[int, dict[str, int]]  # round -> steamid -> equipment value at freeze end
    kills: list[dict[str, Any]] = field(default_factory=list)
    damages: list[dict[str, Any]] = field(default_factory=list)
    blinds: list[dict[str, Any]] = field(default_factory=list)
    grenades: list[dict[str, Any]] = field(default_factory=list)
    bomb: list[dict[str, Any]] = field(default_factory=list)
    # positional snapshots per round phase (see PHASE_OFFSETS_S) for alive players
    positions: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def decompress_if_needed(path: Path) -> Path:
    """FACEIT/Valve distribute demos as .dem, .dem.gz, .dem.bz2 or .dem.zst."""
    name = path.name.lower()
    if name.endswith(".dem"):
        return path
    out = path.with_name(path.name.rsplit(".", 1)[0])
    if not out.name.lower().endswith(".dem"):
        out = out.with_name(out.name + ".dem")
    if name.endswith(".gz"):
        opener = gzip.open(path, "rb")
    elif name.endswith(".bz2"):
        opener = bz2.open(path, "rb")
    elif name.endswith(".zst"):
        import zstandard

        opener = zstandard.ZstdDecompressor().stream_reader(open(path, "rb"))
    else:
        raise DemoParseError("Поддерживаются .dem, .dem.gz, .dem.bz2, .dem.zst")
    with opener as src, open(out, "wb") as dst:
        shutil.copyfileobj(src, dst, 1 << 20)
    return out


def _sid(v: Any) -> str | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    s = str(v)
    return None if s in ("", "0", "None", "nan") else s


def _events(p: DemoParser, name: str, available: set[str], **kw) -> pd.DataFrame:
    if name not in available:
        return pd.DataFrame()
    df = p.parse_event(name, **kw)
    return df if isinstance(df, pd.DataFrame) else pd.DataFrame()


def _ticks_col(df: pd.DataFrame, col: str) -> list[int]:
    return sorted(int(t) for t in df[col].tolist()) if len(df) and col in df else []


def parse_demo(path: Path) -> NormalizedDemo:
    try:
        p = DemoParser(str(path))
        header = p.parse_header()
        available = set(p.list_game_events())
    except Exception as exc:  # demoparser2 raises plain Exceptions for corrupt/unsupported files
        raise DemoParseError(f"Не удалось прочитать демо: {exc}") from exc

    # tickrate from game_time progression (CS2 is 64 tick; measured rather than assumed)
    gt = p.parse_ticks(["game_time"], ticks=[2000, 6000])
    tickrate = 64.0
    if len(gt) and gt["tick"].nunique() == 2:
        g = gt.groupby("tick")["game_time"].first()
        dt = float(g.iloc[1] - g.iloc[0])
        if dt > 0:
            tickrate = round(4000 / dt)

    starts = []
    for ev in ("round_announce_match_start", "begin_new_match"):
        starts += _ticks_col(_events(p, ev, available), "tick")
    match_start = max(starts) if starts else 0

    re_ = _events(p, "round_end", available)
    if not len(re_):
        raise DemoParseError("В демо нет событий round_end — это не запись матча или файл обрезан")
    re_ = (
        re_[(re_["tick"] >= match_start) & (re_["winner"].isin([2, 3]))]
        .drop_duplicates("tick")
        .sort_values("tick")
    )
    freeze = _ticks_col(_events(p, "round_freeze_end", available), "tick")
    rstart = _ticks_col(_events(p, "round_start", available), "tick")
    official = _ticks_col(_events(p, "round_officially_ended", available), "tick")
    last_tick = int(header.get("playback_ticks") or 0) or int(re_["tick"].max()) + POST_ROUND_TICKS_FALLBACK

    rounds: list[RoundRaw] = []
    prev_boundary = match_start
    for i, row in enumerate(re_.itertuples(index=False), start=1):
        end = int(row.tick)
        fz = [t for t in freeze if prev_boundary <= t <= end] or [
            t for t in rstart if prev_boundary <= t <= end
        ]
        freeze_end = fz[-1] if fz else prev_boundary
        nxt = [t for t in official if t > end]
        boundary = nxt[0] if nxt else end + POST_ROUND_TICKS_FALLBACK
        rounds.append(
            RoundRaw(i, prev_boundary, freeze_end, end, boundary, SIDE[int(row.winner)], int(row.reason))
        )
        prev_boundary = boundary
    if rounds:
        rounds[-1].boundary_tick = max(rounds[-1].boundary_tick, rounds[-1].end_tick)

    def round_of(tick: int) -> int | None:
        for r in rounds:
            if r.start_tick < tick <= r.boundary_tick:
                return r.number
        return None

    # sides/equipment at freeze end; rounds without a freeze phase (e.g. surrender vote) fall back to end tick
    sample = {r.freeze_end_tick + 1: r.number for r in rounds}
    fallback = {r.end_tick - 1: r.number for r in rounds}
    ticks = sorted(set(sample) | set(fallback))
    st = p.parse_ticks(["team_num", "current_equip_value"], ticks=ticks) if ticks else pd.DataFrame()
    sides: dict[int, dict[str, str]] = {}
    equip: dict[int, dict[str, int]] = {}
    players: dict[str, str] = {}
    for preferred in (True, False):
        mapping = sample if preferred else fallback
        for row in st.itertuples(index=False):
            sid = _sid(row.steamid)
            rn = mapping.get(int(row.tick))
            if sid is None or rn is None or pd.isna(row.team_num) or int(row.team_num) not in SIDE:
                continue
            if not preferred and rn in sides and sid in sides[rn]:
                continue
            sides.setdefault(rn, {})[sid] = SIDE[int(row.team_num)]
            if preferred:
                equip.setdefault(rn, {})[sid] = (
                    0 if pd.isna(row.current_equip_value) else int(row.current_equip_value)
                )
            players[sid] = str(row.name)

    nd = NormalizedDemo(
        header=header,
        parser_version=version("demoparser2"),
        tickrate=tickrate,
        match_start_tick=match_start,
        last_tick=last_tick,
        players=players,
        rounds=rounds,
        sides=sides,
        equip=equip,
    )

    deaths = _events(p, "player_death", available, player=["X", "Y", "last_place_name"])
    for row in deaths.to_dict("records"):
        tick = int(row["tick"])
        rn = round_of(tick)
        victim = _sid(row.get("user_steamid"))
        if rn is None or victim is None:
            continue
        nd.kills.append(
            {
                "tick": tick,
                "round": rn,
                "attacker": _sid(row.get("attacker_steamid")),
                "victim": victim,
                "assister": _sid(row.get("assister_steamid")),
                "weapon": str(row.get("weapon") or ""),
                "headshot": bool(row.get("headshot")),
                "attacker_place": str(row.get("attacker_last_place_name") or "") or None,
                "victim_place": str(row.get("user_last_place_name") or "") or None,
                "flash_assist": bool(row.get("assistedflash")),
                "wallbang": int(row.get("penetrated") or 0) > 0,
                "thrusmoke": bool(row.get("thrusmoke")),
                "noscope": bool(row.get("noscope")),
                "attacker_blind": bool(row.get("attackerblind")),
                "distance": round(float(row.get("distance") or 0), 1),
                "attacker_pos": [
                    round(float(row.get("attacker_X") or 0)),
                    round(float(row.get("attacker_Y") or 0)),
                ]
                if _sid(row.get("attacker_steamid"))
                else None,
                "victim_pos": [round(float(row.get("user_X") or 0)), round(float(row.get("user_Y") or 0))],
            }
        )

    hurt = _events(p, "player_hurt", available)
    for row in hurt.to_dict("records"):
        tick = int(row["tick"])
        rn = round_of(tick)
        victim = _sid(row.get("user_steamid"))
        if rn is None or victim is None:
            continue
        nd.damages.append(
            {
                "tick": tick,
                "round": rn,
                "attacker": _sid(row.get("attacker_steamid")),
                "victim": victim,
                "dmg_health": int(row.get("dmg_health") or 0),
                "health_after": int(row.get("health") or 0),
                "weapon": str(row.get("weapon") or ""),
            }
        )

    blind = _events(p, "player_blind", available)
    for row in blind.to_dict("records"):
        rn = round_of(int(row["tick"]))
        if rn is None:
            continue
        nd.blinds.append(
            {
                "tick": int(row["tick"]),
                "round": rn,
                "attacker": _sid(row.get("attacker_steamid")),
                "victim": _sid(row.get("user_steamid")),
                "duration": round(float(row.get("blind_duration") or 0), 2),
            }
        )

    for ev, kind in (
        ("flashbang_detonate", "flash"),
        ("smokegrenade_detonate", "smoke"),
        ("hegrenade_detonate", "he"),
        ("inferno_startburn", "molotov"),
    ):
        for row in _events(p, ev, available).to_dict("records"):
            rn = round_of(int(row["tick"]))
            if rn is not None:
                nd.grenades.append(
                    {
                        "tick": int(row["tick"]),
                        "round": rn,
                        "type": kind,
                        "thrower": _sid(row.get("user_steamid")),
                    }
                )

    for ev, kind in (("bomb_planted", "planted"), ("bomb_defused", "defused"), ("bomb_exploded", "exploded")):
        for row in _events(p, ev, available, player=["last_place_name"]).to_dict("records"):
            rn = round_of(int(row["tick"]))
            if rn is not None:  # "site" is an entity index; the planter's place name is human readable
                nd.bomb.append(
                    {
                        "tick": int(row["tick"]),
                        "round": rn,
                        "event": kind,
                        "player": _sid(row.get("user_steamid")),
                        "place": str(row.get("user_last_place_name") or "") or None,
                    }
                )
    # positional snapshots: only inside the live part of a round (before its round_end)
    snap: dict[int, tuple[int, str]] = {}
    for r in rounds:
        for phase, sec in PHASE_OFFSETS_S.items():
            t = r.freeze_end_tick + int(sec * tickrate)
            if t < r.end_tick:
                snap[t] = (r.number, phase)
    if snap:
        pos = p.parse_ticks(["X", "Y", "last_place_name", "is_alive", "team_num"], ticks=sorted(snap))
        for row in pos.itertuples(index=False):
            sid = _sid(row.steamid)
            rn_phase = snap.get(int(row.tick))
            if sid is None or rn_phase is None or not bool(row.is_alive) or pd.isna(row.team_num):
                continue
            if int(row.team_num) not in SIDE:
                continue
            nd.positions.append(
                {
                    "round": rn_phase[0],
                    "phase": rn_phase[1],
                    "tick": int(row.tick),
                    "steamid": sid,
                    "side": SIDE[int(row.team_num)],
                    "place": str(row.last_place_name or "") or None,
                    "x": round(float(row.X), 1),
                    "y": round(float(row.Y), 1),
                }
            )
    nd.kills.sort(key=lambda k: k["tick"])
    nd.damages.sort(key=lambda d: d["tick"])
    return nd
