"""Test-only simulated FACEIT world (never used by the production UI).

Builds a population with shared match histories so scouting can be exercised end-to-end through the
real HTTP provider (via mock_faceit.py). Contains planted, documented ground truth:
* `planted_smurf`      — 30-day-old account, level 10, few matches, very high win rate and stats;
* `duo_a`/`duo_b`      — queue together in most matches;
* enemy players use the SteamIDs of the real demo in samples/ so tactical evidence is genuinely parsed.
Everything else follows Elo-balanced matchmaking with skill-driven outcomes.
"""

import math
import random
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

MAPS = ["de_mirage", "de_inferno", "de_dust2", "de_nuke", "de_ancient", "de_anubis", "de_train"]
LEVELS = [500, 750, 900, 1050, 1200, 1350, 1530, 1750, 2000]
# SteamIDs present in samples/test_demo_mirage.dem (team that started T / team that started CT)
DEMO_T = [
    "76561198265366770",
    "76561197964020430",
    "76561198244754626",
    "76561198202353993",
    "76561198118803912",
]
DEMO_CT = [
    "76561198258044111",
    "76561198194694750",
    "76561198280975787",
    "76561198073049527",
    "76561198324843075",
]
NOW = datetime(2026, 10, 27, 12, 0, tzinfo=UTC)


def level(elo: float) -> int:
    return 1 + sum(1 for b in LEVELS if elo > b)


@dataclass
class P:
    pid: str
    nick: str
    elo: float
    skill: float
    steam: str
    activated: datetime
    lifetime_matches: int
    hs: float = 48
    awp: float = 0.05
    entry: float = 1.0
    history: list[str] = field(default_factory=list)  # match ids, newest last
    stats: list[dict] = field(default_factory=list)


def _uuid(rng):
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def _poisson(rng, lam):
    lam = max(lam, 0.01)
    lim, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= lim:
            return k
        k += 1


def build_world(seed: int = 3, population: int = 70, n_matches: int = 520) -> dict[str, Any]:
    rng = random.Random(seed)
    people: list[P] = []

    def mk(nick, elo, skill=None, age_days=None, matches=None, steam=None, **kw):
        p = P(
            _uuid(rng),
            nick,
            elo,
            skill if skill is not None else (elo - 1500) / 350 + rng.gauss(0, 0.3),
            steam or str(76561198000000000 + rng.getrandbits(28)),
            NOW - timedelta(days=age_days if age_days is not None else rng.randint(400, 2600)),
            matches if matches is not None else rng.randint(250, 2500),
            **kw,
        )
        people.append(p)
        return p

    me = mk("scout_me", 1985, skill=1.38, matches=1200)
    mates = [mk(f"mate_{i}", 1985 + rng.gauss(0, 90)) for i in range(4)]
    smurf = mk("planted_smurf", 2150, skill=3.0, age_days=30, matches=48, steam=DEMO_CT[0], hs=58)
    duo_a = mk("duo_a", 2080, skill=1.7, steam=DEMO_CT[1], entry=1.8)
    duo_b = mk("duo_b", 2010, skill=1.5, steam=DEMO_CT[2], awp=0.35)
    enemy_rest = [mk("enemy_c", 1940, steam=DEMO_CT[3]), mk("enemy_d", 1900, steam=DEMO_CT[4])]
    for i in range(population - len(people)):
        mk(f"pool_{i:02d}", rng.gauss(1980, 170))

    details, stats_by_match, history_items = {}, {}, {}
    t = NOW - timedelta(days=60)
    for _ in range(n_matches):
        t += timedelta(minutes=rng.randint(60, 200))
        center = rng.choice(people)
        cands = sorted(people, key=lambda q: abs(q.elo - center.elo) + rng.uniform(0, 160))[:20]
        chosen: list[P] = []
        for q in cands:
            if q in chosen:
                continue
            group = [q]
            if q in (duo_a, duo_b) and rng.random() < 0.85:
                group = [duo_a, duo_b]
            if len(chosen) + len(group) <= 10 and all(g not in chosen for g in group):
                chosen.extend(group)
            if len(chosen) == 10:
                break
        if len(chosen) < 10:
            continue
        a: list[P] = []
        if duo_a in chosen and duo_b in chosen:
            a = [duo_a, duo_b]
        rest = sorted([q for q in chosen if q not in a], key=lambda q: -q.elo)
        b: list[P] = []
        for q in rest:
            (
                a if (sum(x.elo for x in a) <= sum(x.elo for x in b) and len(a) < 5) or len(b) == 5 else b
            ).append(q)
        mid = "1-" + _uuid(rng)
        _play(rng, mid, a, b, t, rng.choice(MAPS), details, stats_by_match, history_items)

    smurf.lifetime_matches = len(smurf.history) + 3  # consistent: the whole (short) career is visible
    upcoming = "1-" + _uuid(rng)
    team_us = [me] + mates
    team_them = [smurf, duo_a, duo_b] + enemy_rest
    details[upcoming] = _details(upcoming, team_us, team_them, NOW, "de_mirage", status="READY")
    return {
        "people": people,
        "details": details,
        "stats": stats_by_match,
        "history": history_items,
        "upcoming": upcoming,
        "me": me,
        "smurf": smurf,
        "duo": (duo_a, duo_b),
    }


def _faction(team: list[P], fid: str, wp: float):
    lv = [level(q.elo) for q in team]
    return {
        "faction_id": fid,
        "leader": fid,
        "avatar": "",
        "name": f"team_{team[0].nick}",
        "type": "",
        "substituted": False,
        "roster": [
            {
                "player_id": q.pid,
                "nickname": q.nick,
                "avatar": "",
                "membership": "free",
                "game_player_id": q.steam,
                "game_player_name": q.nick,
                "game_skill_level": level(q.elo),
                "anticheat_required": True,
            }
            for q in team
        ],
        "stats": {
            "winProbability": round(wp, 4),
            "skillLevel": {"average": round(sum(lv) / 5), "range": {"min": min(lv), "max": max(lv)}},
            "rating": round(sum(q.elo for q in team) / 5),
        },
    }


def _details(mid, a, b, t, mp, status="FINISHED", winner=None, score=None):
    ea, eb = sum(q.elo for q in a) / 5, sum(q.elo for q in b) / 5
    wp = 1 / (1 + 10 ** ((eb - ea) / 400))
    d = {
        "match_id": mid,
        "version": 2,
        "game": "cs2",
        "region": "EU",
        "competition_id": "c-eu",
        "competition_type": "matchmaking",
        "competition_name": "Europe 5v5 Queue",
        "organizer_id": "faceit",
        "teams": {"faction1": _faction(a, a[0].pid, wp), "faction2": _faction(b, b[0].pid, 1 - wp)},
        "voting": {"map": {"entities": [], "pick": [mp]}},
        "calculate_elo": True,
        "configured_at": int(t.timestamp()) - 60,
        "started_at": int(t.timestamp()),
        "best_of": 1,
        "status": status,
        "faceit_url": f"https://www.faceit.com/{{lang}}/cs2/room/{mid}",
        "demo_url": [],
    }
    if status == "FINISHED":
        d["finished_at"] = int(t.timestamp()) + 2400
        d["results"] = {"winner": winner, "score": score}
    return d


def _play(rng, mid, a, b, t, mp, details, stats_by_match, history_items):
    sa, sb = sum(q.skill for q in a) / 5, sum(q.skill for q in b) / 5
    a_wins = rng.random() < 1 / (1 + math.exp(-2.6 * (sa - sb)))
    lose = max(0, min(11, round(rng.gauss(8, 3))))
    rounds = 13 + lose
    winner = "faction1" if a_wins else "faction2"
    details[mid] = _details(
        mid, a, b, t, mp, "FINISHED", winner, {"faction1": int(a_wins), "faction2": int(not a_wins)}
    )
    teams_stats = []
    for team, won, fid in ((a, a_wins, a[0].pid), (b, not a_wins, b[0].pid)):
        players = []
        for q in team:
            kills = _poisson(rng, rounds * max(0.25, 0.7 + 0.13 * q.skill + (0.07 if won else -0.07)))
            deaths = min(
                rounds, _poisson(rng, rounds * max(0.25, 0.72 - 0.08 * q.skill + (-0.07 if won else 0.07)))
            )
            adr = max(25, rng.gauss(30 + 72 * kills / rounds, 8))
            per_round = [0] * rounds
            for _ in range(kills):
                per_round[rng.randrange(rounds)] += 1
            mk = {k: sum(1 for x in per_round if x == k) for k in (2, 3, 4, 5)}
            ec = _poisson(rng, rounds * 0.1 * q.entry)
            ps = {
                "Kills": kills,
                "Deaths": deaths,
                "Assists": _poisson(rng, rounds * 0.13),
                "ADR": round(adr, 1),
                "Headshots %": round(min(95, max(10, rng.gauss(q.hs, 8)))),
                "Headshots": round(kills * q.hs / 100),
                "K/D Ratio": round(kills / max(deaths, 1), 2),
                "K/R Ratio": round(kills / rounds, 2),
                "Double Kills": mk[2],
                "Triple Kills": mk[3],
                "Quadro Kills": mk[4],
                "Penta Kills": mk[5],
                "MVPs": _poisson(rng, 2),
                "Result": "1" if won else "0",
                "Entry Count": ec,
                "Entry Wins": sum(1 for _ in range(ec) if rng.random() < 0.5 + 0.05 * q.skill),
                "Sniper Kills": sum(1 for _ in range(kills) if rng.random() < q.awp),
                "Utility Damage": _poisson(rng, rounds * 4),
                "Flash Successes": _poisson(rng, rounds * 0.15),
            }
            ps = {k: str(v) for k, v in ps.items()}
            players.append({"player_id": q.pid, "nickname": q.nick, "player_stats": ps})
            q.history.append(mid)
            q.stats.append(
                {
                    **ps,
                    "Player Id": q.pid,
                    "Nickname": q.nick,
                    "Match Id": mid,
                    "Map": mp,
                    "Rounds": str(rounds),
                    "Created At": t.isoformat().replace("+00:00", "Z"),
                    "Game Mode": "5v5",
                }
            )
        teams_stats.append(
            {
                "team_id": fid,
                "premade": False,
                "team_stats": {
                    "Team": f"team_{team[0].nick}",
                    "Final Score": str(13 if won else lose),
                    "Team Win": "1" if won else "0",
                },
                "players": players,
            }
        )
    stats_by_match[mid] = {
        "rounds": [
            {
                "best_of": "1",
                "game_id": "cs2",
                "game_mode": "5v5",
                "match_id": mid,
                "match_round": "1",
                "played": "1",
                "round_stats": {
                    "Map": mp,
                    "Region": "EU",
                    "Rounds": str(rounds),
                    "Score": f"{13 if a_wins else lose} / {lose if a_wins else 13}",
                    "Winner": (a if a_wins else b)[0].pid,
                },
                "teams": teams_stats,
            }
        ]
    }
    item = {
        "match_id": mid,
        "game_id": "cs2",
        "region": "EU",
        "game_mode": "5v5",
        "status": "finished",
        "started_at": int(t.timestamp()),
        "finished_at": int(t.timestamp()) + 2400,
        "competition_name": "Europe 5v5 Queue",
        "teams": {
            "faction1": {
                "team_id": a[0].pid,
                "nickname": f"team_{a[0].nick}",
                "players": [
                    {
                        "player_id": q.pid,
                        "nickname": q.nick,
                        "skill_level": level(q.elo),
                        "game_player_id": q.steam,
                    }
                    for q in a
                ],
            },
            "faction2": {
                "team_id": b[0].pid,
                "nickname": f"team_{b[0].nick}",
                "players": [
                    {
                        "player_id": q.pid,
                        "nickname": q.nick,
                        "skill_level": level(q.elo),
                        "game_player_id": q.steam,
                    }
                    for q in b
                ],
            },
        },
        "results": details[mid]["results"],
        "faceit_url": details[mid]["faceit_url"],
    }
    history_items[mid] = item


def profile(q: P) -> dict:
    return {
        "player_id": q.pid,
        "nickname": q.nick,
        "avatar": "",
        "country": "eu",
        "activated_at": q.activated.isoformat().replace("+00:00", "Z"),
        "steam_id_64": q.steam,
        "verified": False,
        "memberships": ["free"],
        "games": {
            "cs2": {
                "region": "EU",
                "game_player_id": q.steam,
                "skill_level": level(q.elo),
                "faceit_elo": round(q.elo),
                "game_player_name": q.nick,
            }
        },
        "faceit_url": f"https://www.faceit.com/{{lang}}/players/{q.nick}",
    }


def lifetime(q: P) -> dict:
    st = q.stats
    wins = sum(1 for s in st if s["Result"] == "1")
    wr = wins / len(st) if st else 0.5
    if q.nick == "planted_smurf":
        wr = 0.83
    kd = sum(float(s["Kills"]) for s in st) / max(1, sum(float(s["Deaths"]) for s in st)) if st else 1.0
    segs = {}
    for s in st:
        segs.setdefault(s["Map"], []).append(s)
    scale = max(1.0, q.lifetime_matches / max(1, len(st)))
    return {
        "player_id": q.pid,
        "game_id": "cs2",
        "lifetime": {
            "Matches": str(q.lifetime_matches),
            "Win Rate %": str(round(wr * 100)),
            "Wins": str(round(wr * q.lifetime_matches)),
            "Average K/D Ratio": f"{kd:.2f}",
            "Average Headshots %": str(round(q.hs)),
            "Recent Results": [s["Result"] for s in st[-5:]],
        },
        "segments": [
            {
                "label": m,
                "mode": "5v5",
                "type": "Map",
                "stats": {
                    "Matches": str(round(len(v) * scale)),
                    "Win Rate %": str(round(100 * sum(1 for s in v if s["Result"] == "1") / len(v))),
                    "Average K/D Ratio": f"{sum(float(s['Kills']) for s in v) / max(1, sum(float(s['Deaths']) for s in v)):.2f}",
                },
            }
            for m, v in segs.items()
        ],
    }
