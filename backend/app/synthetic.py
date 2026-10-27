"""Seeded generator of FACEIT-API-shaped synthetic data.

Purpose: (1) a clearly-labelled demo dataset for features that need Elo/timestamps, and (2) a ground
truth for validating the matchmaking anomaly detector: with `hidden_pool_strength=0` matchmaking is
Elo-based only (null hypothesis); with > 0 opponents get stronger after win streaks (planted effect).
"""

import itertools
import math
import random
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

MAPS = ["de_mirage", "de_inferno", "de_dust2", "de_nuke", "de_ancient", "de_anubis", "de_train"]
_SYL = ["ka", "zu", "ro", "mi", "xen", "vo", "lux", "tri", "da", "ne", "qo", "ry", "fi", "shu", "ax", "el"]
LEVEL_BOUNDS = [500, 750, 900, 1050, 1200, 1350, 1530, 1750, 2000]


def skill_level(elo: float) -> int:
    return 1 + sum(1 for b in LEVEL_BOUNDS if elo > b)


@dataclass
class SimPlayer:
    player_id: str
    nickname: str
    elo: float
    skill: float
    steam_id: str
    mods: dict[str, float] = field(default_factory=dict)


def _nick(rng: random.Random) -> str:
    return (
        "".join(rng.choice(_SYL) for _ in range(rng.randint(2, 3)))
        + rng.choice(["", "_", "-"])
        + str(rng.randint(0, 99))
    )


def _uuid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def _new_player(rng: random.Random, elo: float, nick: str | None = None) -> SimPlayer:
    return SimPlayer(
        _uuid(rng),
        nick or _nick(rng),
        elo,
        (elo - 1500) / 350 + rng.gauss(0, 0.35),
        str(76561198000000000 + rng.getrandbits(28)),
    )


def _poisson(rng: random.Random, lam: float) -> int:
    lam = max(lam, 0.01)
    l_, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l_:
            return k
        k += 1


def _player_stats(rng: random.Random, p: SimPlayer, rounds: int, deaths: int, kills: int, won: bool) -> dict:
    m = p.mods
    kpr = kills / rounds
    adr = max(20.0, rng.gauss(32 + 70 * kpr, 9) * m.get("adr", 1.0))
    hs = min(95.0, max(10.0, rng.gauss(46 + 4 * p.skill, 9) + m.get("hs", 0)))
    headshots = round(kills * hs / 100)
    # distribute kills into rounds to get multi-kill counts
    per_round = [0] * rounds
    for _ in range(kills):
        per_round[rng.randrange(rounds)] += 1
    per_round = [min(x, 5) for x in per_round]
    kills = sum(per_round)
    cnt = {k: sum(1 for x in per_round if x == k) for k in range(2, 6)}
    entry_count = _poisson(rng, rounds * 0.11 * m.get("entry", 1.0))
    entry_wins = sum(
        1 for _ in range(entry_count) if rng.random() < 0.48 + 0.06 * p.skill + m.get("entry_wr", 0)
    )
    c11 = _poisson(rng, rounds * 0.035)
    c12 = _poisson(rng, rounds * 0.03)
    clutch_wr = 0.45 + 0.05 * p.skill + m.get("clutch", 0)
    c11w = sum(1 for _ in range(c11) if rng.random() < clutch_wr)
    c12w = sum(1 for _ in range(c12) if rng.random() < clutch_wr * 0.4)
    util = _poisson(rng, rounds * 0.25 * m.get("utility", 1.0))
    flashes = _poisson(rng, rounds * 0.35 * m.get("utility", 1.0))
    flash_succ = sum(1 for _ in range(flashes) if rng.random() < 0.45)
    enemies_flashed = flash_succ + _poisson(rng, flash_succ * 0.4)
    util_dmg = round(sum(rng.uniform(5, 45) for _ in range(util)))
    sniper = sum(1 for _ in range(kills) if rng.random() < m.get("awp", 0.07))
    s = {
        "Kills": kills,
        "Deaths": deaths,
        "Assists": _poisson(rng, rounds * 0.14),
        "Headshots": headshots,
        "Headshots %": round(100 * headshots / kills) if kills else 0,
        "MVPs": _poisson(rng, kills * 0.12),
        "ADR": round(adr, 1),
        "Damage": round(adr * rounds),
        "K/R Ratio": round(kills / rounds, 2),
        "K/D Ratio": round(kills / max(deaths, 1), 2),
        "Double Kills": cnt[2],
        "Triple Kills": cnt[3],
        "Quadro Kills": cnt[4],
        "Penta Kills": cnt[5],
        "Entry Count": entry_count,
        "Entry Wins": entry_wins,
        "First Kills": entry_wins,
        "1v1Count": c11,
        "1v1Wins": c11w,
        "1v2Count": c12,
        "1v2Wins": c12w,
        "Clutch Kills": c11w + 2 * c12w,
        "Utility Count": util,
        "Utility Damage": util_dmg,
        "Utility Successes": min(util, util_dmg // 20),
        "Flash Count": flashes,
        "Flash Successes": flash_succ,
        "Enemies Flashed": enemies_flashed,
        "Sniper Kills": sniper,
        "Pistol Kills": _poisson(rng, 1.4),
        "Knife Kills": 0,
        "Zeus Kills": 0,
        "Result": "1" if won else "0",
    }
    return {k: str(v) for k, v in s.items()}


def generate(
    seed: int = 7,
    n_matches: int = 150,
    hidden_pool_strength: float = 0.0,
    focus_nick: str = "sim_player",
    start_elo: float = 1720,
    true_skill_offset: float = 0.55,
    end: datetime | None = None,
) -> dict[str, Any]:
    rng = random.Random(seed)
    focus = _new_player(rng, start_elo, focus_nick)
    focus.skill = (start_elo - 1500) / 350 + true_skill_offset  # underrated: should climb
    focus.mods = {
        "adr": 1.08,
        "entry": 1.7,
        "entry_wr": 0.05,
        "utility": 0.55,
        "clutch": -0.15,
        "hs": 6,
        "awp": 0.04,
    }
    friends = [_new_player(rng, start_elo + rng.gauss(0, 80), n) for n in ("sim_duo_a", "sim_duo_b")]
    end = end or datetime(2026, 10, 20, tzinfo=UTC)
    t = end - timedelta(days=120)
    history, details, stats = [], {}, {}
    streak = 0
    for _ in range(n_matches):
        t += timedelta(hours=rng.uniform(6, 30))
        hour = rng.choices(
            range(24), weights=[3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 5, 6, 8, 9, 9, 8, 6, 4]
        )[0]
        started = t.replace(hour=hour, minute=rng.randrange(60))
        r = rng.random()
        party = [focus] + (friends[:1] if r < 0.25 else friends if r < 0.37 else [])
        others = [_new_player(rng, rng.gauss(focus.elo, 110)) for _ in range(10 - len(party))]
        # Elo-balanced split keeping the party together: exhaustive search over team compositions
        need = 5 - len(party)
        best = min(
            itertools.combinations(range(len(others)), need),
            key=lambda c: abs(
                sum(p.elo for p in party)
                + sum(others[i].elo for i in c)
                - sum(others[i].elo for i in range(len(others)) if i not in c)
            ),
        )
        team_a = list(party) + [others[i] for i in best]
        team_b = [others[i] for i in range(len(others)) if i not in best]
        if hidden_pool_strength > 0 and streak >= 2:  # planted effect: harder (hidden-stronger) opponents
            for p in team_b:
                p.skill += hidden_pool_strength * min(streak, 5) / 5
        ea, eb = sum(p.elo for p in team_a) / 5, sum(p.elo for p in team_b) / 5
        pe = 1 / (1 + 10 ** ((eb - ea) / 400))
        sa, sb = sum(p.skill for p in team_a) / 5, sum(p.skill for p in team_b) / 5
        p_true = 1 / (1 + math.exp(-2.4 * (sa - sb)))
        a_wins = rng.random() < p_true
        loser = max(0, min(12, round(rng.gauss(8.5 - 6 * abs(p_true - 0.5), 3))))
        ot = rng.random() < 0.08
        win_score, lose_score = (16, rng.choice([12, 13, 14])) if ot else (13, loser)
        rounds = win_score + lose_score
        sc_a, sc_b = (win_score, lose_score) if a_wins else (lose_score, win_score)

        def kills_for(team, won):
            return [
                max(
                    0,
                    _poisson(
                        rng,
                        rounds
                        * (0.66 + 0.11 * p.skill + (0.06 if won else -0.06))
                        * (1.08 if p is focus else 1.0),
                    ),
                )
                for p in team
            ]

        ka, kb = kills_for(team_a, a_wins), kills_for(team_b, not a_wins)

        def deaths_from(total, team):
            d = [0] * 5
            weights = [max(0.2, 1.2 - 0.25 * p.skill) for p in team]
            for _ in range(total):
                i = rng.choices(range(5), weights=weights)[0]
                if d[i] < rounds:
                    d[i] += 1
            return d

        da, db = deaths_from(sum(kb), team_a), deaths_from(sum(ka), team_b)
        mid = "1-" + _uuid(rng)
        fid_a, fid_b = team_a[0].player_id, team_b[0].player_id
        mp = rng.choice(MAPS)

        def roster(team):
            return [
                {
                    "player_id": p.player_id,
                    "nickname": p.nickname,
                    "avatar": "",
                    "membership": "free",
                    "game_player_id": p.steam_id,
                    "game_player_name": p.nickname,
                    "game_skill_level": skill_level(p.elo),
                    "anticheat_required": True,
                }
                for p in team
            ]

        def faction(team, fid, e):
            levels = [skill_level(p.elo) for p in team]
            return {
                "faction_id": fid,
                "leader": fid,
                "avatar": "",
                "name": f"team_{team[0].nickname}",
                "type": "",
                "substituted": False,
                "roster": roster(team),
                "stats": {
                    "winProbability": round(pe if fid == fid_a else 1 - pe, 4),
                    "skillLevel": {
                        "average": round(sum(levels) / 5),
                        "range": {"min": min(levels), "max": max(levels)},
                    },
                    "rating": round(e),
                },
            }

        ts0 = int(started.timestamp())
        ts1 = ts0 + rounds * 115
        winner = "faction1" if a_wins else "faction2"
        details[mid] = {
            "match_id": mid,
            "version": 2,
            "game": "cs2",
            "region": "EU",
            "competition_id": "c-eu-5v5",
            "competition_type": "matchmaking",
            "competition_name": "Europe 5v5 Queue",
            "organizer_id": "faceit",
            "teams": {"faction1": faction(team_a, fid_a, ea), "faction2": faction(team_b, fid_b, eb)},
            "voting": {"map": {"entities": [], "pick": [mp]}},
            "calculate_elo": True,
            "configured_at": ts0 - 60,
            "started_at": ts0,
            "finished_at": ts1,
            "demo_url": [],
            "best_of": 1,
            "results": {"winner": winner, "score": {"faction1": int(a_wins), "faction2": int(not a_wins)}},
            "status": "FINISHED",
            "faceit_url": f"https://www.faceit.com/{{lang}}/cs2/room/{mid}",
        }

        def stat_team(team, fid, kills, deaths, won, score, half):
            return {
                "team_id": fid,
                "premade": False,
                "team_stats": {
                    "Team": f"team_{team[0].nickname}",
                    "Final Score": str(score),
                    "First Half Score": str(half),
                    "Second Half Score": str(min(score, 13) - half),
                    "Overtime score": str(max(score - 13, 0)),
                    "Team Win": "1" if won else "0",
                    "Team Headshots": "0",
                },
                "players": [
                    {
                        "player_id": p.player_id,
                        "nickname": p.nickname,
                        "player_stats": _player_stats(rng, p, rounds, deaths[i], kills[i], won),
                    }
                    for i, p in enumerate(team)
                ],
            }

        ha, hb = min(sc_a, 12, rng.randint(sc_a // 3, max(sc_a // 3, min(sc_a, 12)))), 0
        hb = min(12 - ha, sc_b)
        stats[mid] = {
            "rounds": [
                {
                    "best_of": "1",
                    "competition_id": None,
                    "game_id": "cs2",
                    "game_mode": "5v5",
                    "match_id": mid,
                    "match_round": "1",
                    "played": "1",
                    "round_stats": {
                        "Map": mp,
                        "Region": "EU",
                        "Rounds": str(rounds),
                        "Score": f"{sc_a} / {sc_b}",
                        "Winner": fid_a if a_wins else fid_b,
                    },
                    "teams": [
                        stat_team(team_a, fid_a, ka, da, a_wins, sc_a, ha),
                        stat_team(team_b, fid_b, kb, db, not a_wins, sc_b, hb),
                    ],
                }
            ]
        }

        def hist_team(team, fid):
            return {
                "team_id": fid,
                "nickname": f"team_{team[0].nickname}",
                "avatar": "",
                "type": "",
                "players": [
                    {
                        "player_id": p.player_id,
                        "nickname": p.nickname,
                        "avatar": "",
                        "skill_level": skill_level(p.elo),
                        "game_player_id": p.steam_id,
                        "game_player_name": p.nickname,
                        "faceit_url": "",
                    }
                    for p in team
                ],
            }

        history.append(
            {
                "match_id": mid,
                "game_id": "cs2",
                "region": "EU",
                "match_type": "",
                "game_mode": "5v5",
                "max_players": 10,
                "teams_size": 5,
                "teams": {"faction1": hist_team(team_a, fid_a), "faction2": hist_team(team_b, fid_b)},
                "playing_players": [p.player_id for p in team_a + team_b],
                "competition_id": "c-eu-5v5",
                "competition_name": "Europe 5v5 Queue",
                "competition_type": "matchmaking",
                "organizer_id": "faceit",
                "status": "finished",
                "started_at": ts0,
                "finished_at": ts1,
                "results": details[mid]["results"],
                "faceit_url": details[mid]["faceit_url"],
            }
        )
        # FACEIT-like Elo update for the persistent players
        for p in party:
            delta = round(50 * ((1 if a_wins else 0) - pe))
            p.elo += delta if delta != 0 else (1 if a_wins else -1)
        streak = (max(streak, 0) + 1) if a_wins else (min(streak, 0) - 1)

    profile = {
        "player_id": focus.player_id,
        "nickname": focus.nickname,
        "avatar": "",
        "country": "ru",
        "games": {
            "cs2": {
                "region": "EU",
                "game_player_id": focus.steam_id,
                "skill_level": skill_level(focus.elo),
                "faceit_elo": round(focus.elo),
                "game_player_name": focus.nickname,
                "skill_level_label": str(skill_level(focus.elo)),
                "game_profile_id": "",
            }
        },
        "faceit_url": f"https://www.faceit.com/{{lang}}/players/{focus.nickname}",
    }
    history.reverse()  # API returns newest first
    return {
        "profile": profile,
        "history": history,
        "details": details,
        "stats": stats,
        "truth": {"final_elo": round(focus.elo), "true_skill": focus.skill},
    }
