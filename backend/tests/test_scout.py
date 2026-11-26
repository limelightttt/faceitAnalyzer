"""Match Scout end-to-end through the real FaceitApiProvider against the mock FACEIT HTTP API."""

import time

import pytest
from fastapi.testclient import TestClient

from app.db import Prediction
from app.scout.url import parse_match_ref
from tests.conftest import SAMPLE_DEMO, login


def _wait(client, sid, timeout=60):
    for _ in range(int(timeout * 10)):
        r = client.get(f"/api/scout/{sid}").json()
        if r["status"] in ("done", "error"):
            return r
        time.sleep(0.1)
    raise AssertionError("scout did not finish")


def test_parse_match_ref():
    mid = "1-0acdf87b-7a65-4c1e-9736-f6614ab5d7f2"
    assert parse_match_ref(f"https://www.faceit.com/en/cs2/room/{mid}/scoreboard") == mid
    assert parse_match_ref(mid.upper()) == mid
    assert parse_match_ref("https://evil.example/room/" + mid) is None
    assert parse_match_ref("hello") is None


def test_scout_report_prediction_and_validation(world_app):
    client, world, mock = world_app
    csrf = login(client, "scout_me")
    # the bundled sample demo cannot be deleted through the API; clear positional evidence directly
    assert client.delete("/api/demos/sample00mirage", headers={"X-CSRF-Token": csrf}).status_code == 403
    from sqlalchemy import delete as sql_delete

    from app.db import TacticalSample

    with client.app.state.ctx.db.session() as s:
        s.execute(sql_delete(TacticalSample))
    url = f"https://www.faceit.com/ru/cs2/room/{world['upcoming']}"
    assert (
        client.post("/api/scout", json={"url": "garbage"}, headers={"X-CSRF-Token": csrf}).status_code == 400
    )
    r = client.post("/api/scout", json={"url": url}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 202
    res = _wait(client, r.json()["id"])
    assert res["status"] == "done", res.get("error")
    rep = res["report"]
    assert rep["phase"] == "pre" and rep["map"] == "de_mirage"
    assert rep["user_faction"] == "faction1"
    assert all(len(t["players"]) == 5 for t in rep["teams"].values())
    names = {p["nickname"]: p for t in rep["teams"].values() for p in t["players"]}
    # planted ground truth
    assert names["planted_smurf"]["risk"]["classification"] in (
        "new_account_high_performance",
        "possible_smurf",
    )
    flagged = [n for n, p in names.items() if p["risk"]["classification"]]
    assert flagged == ["planted_smurf"], flagged
    duo = [p for p in rep["teams"]["faction2"]["pairs"] if {p["a_name"], p["b_name"]} == {"duo_a", "duo_b"}][
        0
    ]
    assert duo["category"] in ("possible_duo", "established_cooperation")
    assert all(
        p["category"] == "insufficient_evidence" or p["shared_matches"] >= 3
        for t in rep["teams"].values()
        for p in t["pairs"]
    )
    # no demos ingested in this app -> no positional claims
    assert rep["tactical_coverage"]["players_with_demos"] == 0
    assert not [b for b in rep["briefing"] if b["category"] == "tactical" and b["kind"] != "fact"]
    kinds = {b["kind"] for b in rep["briefing"]}
    assert kinds <= {"fact", "estimate", "hypothesis"} and "hypothesis" in kinds
    # immutable prediction snapshot
    pred = res["prediction"]
    assert pred and pred["pre_match"] and pred["algo_version"].startswith("scout-v1")
    assert pred["payload"]["elo_expectation_faction1"] == rep["comparison"]["elo_expectation"]
    # rescout reuses / never creates a second prediction
    r2 = client.post("/api/scout", json={"url": url, "refresh": True}, headers={"X-CSRF-Token": csrf})
    _wait(client, r2.json()["id"])
    assert len(client.get("/api/predictions").json()) == 1
    db = client.app.state.ctx.db
    with pytest.raises(ValueError), db.session() as s:
        p = s.get(Prediction, pred["id"])
        p.algo_version = "tampered"
        s.flush()
    # match finishes -> outcome + metrics
    from fastapi.testclient import TestClient

    with TestClient(mock) as m:
        assert m.post(f"/admin/finish/{world['upcoming']}", json={"winner": "faction2"}).status_code == 200
    # bypass the 20 s live-match cache
    for f in client.app.state.ctx.provider._cache_dir.glob("*.json"):
        f.unlink()
    out = client.post("/api/predictions/resolve", headers={"X-CSRF-Token": csrf}).json()
    assert out["resolved"] == 1
    preds = client.get("/api/predictions").json()
    o = preds[0]["outcome"]
    assert o["winner"] == "faction2" and "brier" in o and o["signals"]["risk"][0]["top3"] is True
    m = client.get("/api/predictions/metrics").json()
    assert m["scored"] == 1 and m["baseline_brier"] == 0.25
    fb = client.post(
        "/api/feedback",
        json={
            "match_id": world["upcoming"],
            "prediction_id": preds[0]["id"],
            "target": "risk:planted",
            "verdict": "correct",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert fb.status_code == 201
    assert client.get("/api/predictions/metrics").json()["feedback"]["by_verdict"]["correct"] == 1


@pytest.mark.skipif(not SAMPLE_DEMO.exists(), reason="sample demo not downloaded")
def test_scout_uses_parsed_demo_positions(world_app):
    client, world, _ = world_app
    csrf = login(client, "scout_me")
    with open(SAMPLE_DEMO, "rb") as f:
        r = client.post("/api/demos", files={"file": ("m.dem", f)}, headers={"X-CSRF-Token": csrf})
    demo_id = r.json()["id"]
    for _ in range(600):
        if client.get(f"/api/demos/{demo_id}").json()["meta"]["status"] == "done":
            break
        time.sleep(0.1)
    res = _wait(
        client,
        client.post("/api/scout", json={"url": world["upcoming"]}, headers={"X-CSRF-Token": csrf}).json()[
            "id"
        ],
    )
    rep = res["report"]
    assert rep["tactical_coverage"]["players_with_demos"] == 5  # the enemy team uses the demo's SteamIDs
    tac = [b for b in rep["briefing"] if b["category"] == "tactical" and b["kind"] == "estimate"]
    assert tac and all(b["confidence"] in ("preliminary", "pattern") for b in tac)
    m = client.get("/api/maps/de_mirage").json()
    assert m["points"] and m["centroids"]


def test_detect_active_match_is_honest(world_app):
    client, _, _ = world_app
    login(client, "scout_me")
    r = client.get("/api/scout-detect").json()
    assert r["found"] is False and "ссылку" in r["reason"]


def test_live_state_of_a_scouted_match(world_app):
    """An open report polls this to notice the map pick; other users cannot probe someone's report."""
    client, world, mock = world_app
    csrf = login(client, "scout_me")
    w = mock.state.world
    w["details"][world["upcoming"]]["voting"]["map"]["pick"] = []  # veto still running
    sid = client.post("/api/scout", json={"url": world["upcoming"]}, headers={"X-CSRF-Token": csrf}).json()[
        "id"
    ]
    live = client.get(f"/api/scout/{sid}/live").json()
    assert live == {"status": "READY", "phase": "pre", "map": None}
    assert _wait(client, sid)["report"]["map"] is None

    other = TestClient(client.app, base_url="http://localhost:8000")
    login(other, "duo_a")
    assert other.get(f"/api/scout/{sid}/live").status_code == 404


def test_refresh_rereads_the_room(world_app):
    """Regression: "Обновить" right after the veto served the room from the 20 s live cache (old map)."""
    client, world, mock = world_app
    csrf = login(client, "scout_me")
    room = mock.state.world["details"][world["upcoming"]]
    room["voting"]["map"]["pick"] = []
    sid = client.post("/api/scout", json={"url": world["upcoming"]}, headers={"X-CSRF-Token": csrf}).json()[
        "id"
    ]
    assert _wait(client, sid)["report"]["map"] is None
    room["voting"]["map"]["pick"] = ["de_nuke"]
    again = client.post(
        "/api/scout", json={"url": world["upcoming"], "refresh": True}, headers={"X-CSRF-Token": csrf}
    ).json()
    assert again["reused"] is False
    assert _wait(client, again["id"])["report"]["map"] == "de_nuke"


def test_fairness_of_a_scouted_match_and_of_a_history(world_app):
    """The planted smurf (48 matches, level 10, 83% wins) makes the room unequal against the side facing it;
    over a history, smurf-flagged accounts are counted per side and the split is tested."""
    client, world, mock = world_app
    csrf = login(client, "scout_me")
    h = {"X-CSRF-Token": csrf}
    sid = client.post("/api/scout", json={"url": world["upcoming"]}, headers=h).json()["id"]
    fair = _wait(client, sid)["report"]["fairness"]
    smurfs = {s["nickname"] for side in ("you", "them") for s in fair[side]["smurfs"]}
    assert "planted_smurf" in smurfs and fair["chance_real"] is not None
    side = "them" if any(s["nickname"] == "planted_smurf" for s in fair["them"]["smurfs"]) else "you"
    assert fair["code"] == ("against" if side == "them" else "favour")

    assert client.get("/api/players/scout_me/fairness").json() is None
    rid = client.post("/api/players/scout_me/fairness", headers=h).json()["id"]
    for _ in range(600):
        r = client.get("/api/players/scout_me/fairness").json()
        if r["status"] != "running":
            break
        time.sleep(0.1)
    assert r["id"] == rid and r["status"] == "done", r.get("error")
    res = r["result"]
    assert res["matches"] == len(res["rows"]) > 0 and res["code"] in ("anomaly", "lean", "none")
    assert res["against"] == sum(row["code"] == "against" for row in res["rows"])
    assert res["smurfs"]["slots_them"] == 5 * res["matches"]
    again = client.post("/api/players/scout_me/fairness", headers=h).json()
    assert again == {"id": rid, "reused": True}  # recent result: no new FACEIT requests


def test_elo_page_with_a_single_level_lobby(world_app):
    """Regression: lobbies where everyone has the same FACEIT level made the Elo report fail with NaN (500)."""
    client, _, _ = world_app
    login(client, "scout_me")
    r = client.get("/api/players/scout_me/elo?limit=50")
    assert r.status_code == 200 and r.json()["implied"]["available"] is False
