"""Stack (duo/party) map pool: shrinkage math, together-detection and the API endpoint."""

import pytest

from app.scout.features import PlayerFeatures, RecentMatch
from app.scout.stack import BAN, PICK, stack_map_pool
from tests.conftest import login


def _player(pid: str, maps: dict[str, tuple[int, float]], recent=(), together=None) -> PlayerFeatures:
    p = PlayerFeatures(pid, pid, "stack", None, None, None, 2500, 10, None, 1000, 0.5, 1.0, 45.0, 80.0)
    p.map_segments = {
        m: {"matches": n, "win_rate": wr, "kd": 1.0, "adr": 80.0} for m, (n, wr) in maps.items()
    }
    p.recent = [
        RecentMatch(mid, m, won, 10, 10, 2, 80.0, 40.0, 24, 1.0, None, None, None, None, None, None)
        for mid, m, won in recent
    ]
    p.history_together = together or {}
    p.history_matches = 100
    return p


def test_small_samples_never_outrank_solid_maps():
    lucky = [(f"l{i}", "de_anubis", True) for i in range(3)]
    solid = [(f"s{i}", "de_mirage", i % 3 != 0) for i in range(30)]  # 67% over 30 recent games
    a = _player("a", {"de_anubis": (3, 1.0), "de_mirage": (300, 0.6)}, lucky + solid)
    pool = stack_map_pool([a])["maps"]
    rows = {r["map"]: r for r in pool}
    assert rows["de_mirage"]["score"] > rows["de_anubis"]["score"]
    assert pool[-1]["map"] == "de_anubis"  # no experience: listed last
    assert rows["de_anubis"]["verdict"] == "ban" and rows["de_anubis"]["inexperienced"] == ["a"]
    assert rows["de_mirage"]["verdict"] == "pick" and rows["de_mirage"]["score"] >= PICK


def test_games_played_together_move_the_stack_score():
    recent = [(f"m{i}", "de_nuke", False) for i in range(12)] + [
        (f"x{i}", "de_inferno", True) for i in range(5)
    ]
    together = {"b": [(f"m{i}", False) for i in range(12)]}
    a = _player("a", {"de_nuke": (100, 0.55), "de_inferno": (100, 0.55)}, recent, together)
    b = _player("b", {"de_nuke": (100, 0.55), "de_inferno": (100, 0.55)}, together={"a": together["b"]})
    pool = stack_map_pool([a, b])
    nuke = next(r for r in pool["maps"] if r["map"] == "de_nuke")
    assert nuke["together_matches"] == 12 and nuke["together_win_rate"] == 0
    assert nuke["score"] <= BAN  # individually fine, but this duo keeps losing it together
    assert pool["together"]["matches"] == 12
    scores = [r["score"] for r in pool["maps"] if not r["inexperienced"]]
    assert scores == sorted(scores, reverse=True)


def test_only_maps_from_the_current_pool_are_listed():
    a = _player("a", {"de_cache": (500, 0.7), "de_mirage": (50, 0.5)}, [("r1", "de_mirage", True)])
    assert [r["map"] for r in stack_map_pool([a])["maps"]] == ["de_mirage"]


def test_stack_endpoint_for_a_real_duo(world_app):
    client, world, _ = world_app
    login(client, "scout_me")
    r = client.get("/api/stack/maps", params={"players": "duo_a, duo_b"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [p["nickname"] for p in body["players"]] == ["duo_a", "duo_b"]
    assert body["together"]["matches"] > 0  # the mock world's duo queues together
    assert body["maps"] and all(0 < m["score"] < 1 for m in body["maps"])
    assert {m["verdict"] for m in body["maps"]} <= {"pick", "neutral", "ban"}


@pytest.mark.parametrize(
    "players,status",
    [("", 422), ("a,b,c,d,e,f", 400), ("duo_a,DUO_A", 400), ("no_such_player_zz", 404)],
)
def test_stack_endpoint_rejects_bad_input(world_app, players, status):
    client, _, _ = world_app
    login(client, "scout_me")
    r = client.get("/api/stack/maps", params={"players": players} if players else {})
    assert r.status_code == status, r.text
    if status == 404:
        assert r.json()["source"] == "faceit"
