from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import login, make_settings


def test_coach_overview_goals_and_progress(tmp_path):
    app = create_app(make_settings(tmp_path, auth_dev_login=True))
    with TestClient(app, base_url="http://localhost:8000") as c:
        assert c.get("/api/coach").status_code == 401
        csrf = login(c, "sim_player")
        ov = c.get("/api/coach").json()
        assert ov["profile"]["nickname"] == "sim_player"
        assert ov["weekly"] and ov["weekly"][0]["matches"] > 0
        # suggestions come only from measured weaknesses (synthetic player: weak utility)
        assert any(s["metric"] == "utility_dpr" for s in ov["suggestions"])
        assert all(
            "why" in s and "n =" in s["why"] for s in ov["suggestions"] if s["metric"] != "traded_death_rate"
        )
        h = {"X-CSRF-Token": csrf}
        r = c.post("/api/coach/goals", json={"metric": "utility_dpr"}, headers=h)
        assert (
            r.status_code == 201 and r.json()["baseline_n"] >= 8 and r.json()["target"] > r.json()["baseline"]
        )
        assert c.post("/api/coach/goals", json={"metric": "map_win_rate"}, headers=h).status_code == 400
        assert c.post("/api/coach/goals", json={"metric": "traded_death_rate"}, headers=h).status_code == 409
        goals = c.get("/api/coach").json()["goals"]
        assert goals[0]["progress"]["n_after"] == 0 and goals[0]["progress"]["enough_data"] is False
        assert c.delete(f"/api/coach/goals/{goals[0]['id']}", headers=h).status_code == 204
        hist = c.get("/api/me/history").json()
        assert isinstance(hist, list)
