"""Match Scout end-to-end through the real FaceitApiProvider against the mock FACEIT HTTP API."""

import time

import pytest

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
