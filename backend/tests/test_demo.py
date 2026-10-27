import pytest

from app.demo.analysis import analyze_demo
from app.demo.parser import NormalizedDemo, RoundRaw, parse_demo
from tests.conftest import SAMPLE_DEMO

A = ["a1", "a2", "a3", "a4", "a5"]
B = ["b1", "b2", "b3", "b4", "b5"]


def _kill(tick, att, vic, **kw):
    base = {
        "tick": tick,
        "round": 1,
        "attacker": att,
        "victim": vic,
        "assister": None,
        "weapon": "ak47",
        "headshot": False,
        "flash_assist": False,
        "wallbang": False,
        "thrusmoke": False,
        "noscope": False,
        "attacker_blind": False,
        "distance": 10.0,
        "attacker_pos": [0, 0],
        "victim_pos": [0, 0],
    }
    base.update(kw)
    return base


def _demo(kills, damages=(), winner="T"):
    return NormalizedDemo(
        header={"map_name": "de_test"},
        parser_version="test",
        tickrate=64.0,
        match_start_tick=0,
        last_tick=10_000,
        players={s: s.upper() for s in A + B},
        rounds=[RoundRaw(1, 0, 100, 5000, 5400, winner, 9 if winner == "T" else 8)],
        sides={1: {**{s: "T" for s in A}, **{s: "CT" for s in B}}},
        equip={1: {s: 800 for s in A + B}},
        kills=list(kills),
        damages=list(damages),
    )


def test_opening_trade_kast_and_clutch():
    kills = [
        _kill(200, "b1", "a1"),  # opening kill for b1
        _kill(260, "a2", "b1", headshot=True),  # trade within 5 s -> a1 traded, a2 trade kill
        _kill(1000, "b2", "a2"),
        _kill(1100, "b3", "a3"),
        _kill(1200, "b4", "a4"),  # a5 alone vs 4
        _kill(1700, "a5", "b2"),
        _kill(1800, "a5", "b3"),
        _kill(1900, "a5", "b4"),
        _kill(2000, "a5", "b5"),
    ]
    res = analyze_demo(_demo(kills), "t.dem")
    p = {x["steamid"]: x for x in res["players"]}
    assert p["b1"]["opening_kills"] == 1 and p["a1"]["opening_deaths"] == 1
    assert p["a2"]["trade_kills"] == 1 and p["a1"]["traded_deaths"] == 1
    assert p["a1"]["kast"] == 100.0  # traded death counts for KAST
    assert p["a3"]["kast"] == 0.0
    assert p["a5"]["clutch_attempts"] == 1 and p["a5"]["clutch_wins"] == 1
    assert p["a5"]["multi"]["4"] == 1
    rnd = res["rounds"][0]
    assert rnd["clutch"]["vs"] == 4 and rnd["clutch"]["won"]
    top = res["highlights"][0]
    assert (
        top["steamid"] == "a5" and "клатч 1v4" in top["tags"] and top["goto_cmd"].startswith("demo_gototick ")
    )
    assert top["start_tick"] >= rnd["freeze_end_tick"]


def test_damage_is_capped_by_remaining_health():
    dmg = [
        {
            "tick": 300,
            "round": 1,
            "attacker": "a1",
            "victim": "b1",
            "dmg_health": 80,
            "health_after": 20,
            "weapon": "ak47",
        },
        {
            "tick": 310,
            "round": 1,
            "attacker": "a1",
            "victim": "b1",
            "dmg_health": 110,
            "health_after": 0,
            "weapon": "ak47",
        },
        {
            "tick": 320,
            "round": 1,
            "attacker": "a2",
            "victim": "a3",
            "dmg_health": 50,
            "health_after": 50,
            "weapon": "ak47",
        },
    ]
    res = analyze_demo(_demo([_kill(310, "a1", "b1")], dmg), "t.dem")
    p = {x["steamid"]: x for x in res["players"]}
    assert p["a1"]["damage"] == 100  # 80 + min(110, 20)
    assert p["a2"]["damage"] == 0  # team damage excluded


@pytest.mark.skipif(not SAMPLE_DEMO.exists(), reason="run scripts/fetch_sample_demo.sh to get the real demo")
def test_real_demo_matches_independent_parser():
    """Reference values cross-checked with Awpy 3.1 (scripts/validate_against_awpy.py)."""
    res = analyze_demo(parse_demo(SAMPLE_DEMO), SAMPLE_DEMO.name)
    assert res["map"] == "de_mirage" and res["rounds_played"] == 10
    assert sorted(t["score"] for t in res["teams"]) == [2, 8]
    p = {x["name"]: x for x in res["players"]}
    expected = {
        "123": (11, 1, 113.9),
        "NIGHTSOUL": (10, 1, 94.2),
        "-ExΩtiC-": (8, 1, 77.4),
        "Dog": (6, 2, 74.1),
        "miu miu": (3, 3, 52.3),
        "Trahun <3 V": (2, 3, 42.5),
    }
    for name, (k, a, adr) in expected.items():
        assert (p[name]["kills"], p[name]["assists"], p[name]["adr"]) == (k, a, adr), name
    assert p["NIGHTSOUL"]["opening_kills"] == 5 and p["123"]["flashes"] == 15
    assert len(res["highlights"]) >= 1
