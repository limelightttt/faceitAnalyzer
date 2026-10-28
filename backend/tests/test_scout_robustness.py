"""Match Scout edge cases through the real provider and the mock FACEIT API."""

import copy
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.faceit_api import FaceitApiProvider
from app.scout.url import parse_match_ref
from tests.conftest import login, make_settings
from tests.support.mock_faceit import create_mock

MID = "1-0acdf87b-7a65-4c1e-9736-f6614ab5d7f2"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.faceit.com/en/cs2/room/{MID}",
        f"https://www.faceit.com/ru/cs2/room/{MID}/scoreboard",
        f"https://www.faceit.com/pt-br/cs2/room/{MID}?tab=overview",
        f"https://faceit.com/cs2/room/{MID}",
        f"www.faceit.com/en/cs2/room/{MID}",
        f"  {MID.upper()}  ",
    ],
)
def test_url_variants(url):
    assert parse_match_ref(url) == MID


@pytest.mark.parametrize(
    "url",
    [
        "",
        "https://www.faceit.com/en/cs2/room/",
        "https://faceit.com.evil.io/room/" + MID,
        "https://example.com/" + MID,
        "1-xyz",
        "x" * 400,
    ],
)
def test_bad_urls(url):
    assert parse_match_ref(url) is None


class Flaky(httpx.AsyncBaseTransport):
    """Wraps the mock: per-player failures, 429 after N calls."""

    def __init__(self, app, broken_players=(), empty_stats=(), rate_limit_after=None):
        self.inner = httpx.ASGITransport(app=app)
        self.broken, self.empty, self.rl, self.n = set(broken_players), set(empty_stats), rate_limit_after, 0

    async def handle_async_request(self, request):
        self.n += 1
        path = request.url.path
        if self.rl is not None and self.n > self.rl:
            return httpx.Response(429, headers={"Retry-After": "900"})
        if any(pid in path for pid in self.broken):
            return httpx.Response(404)
        if any(path.endswith(f"/players/{pid}/stats/cs2") for pid in self.empty):
            return httpx.Response(200, json={"player_id": "x", "lifetime": {}, "segments": []})
        return await self.inner.handle_async_request(request)


def _run(tmp_path, mock, transport, url=None):
    prov = FaceitApiProvider(
        "test-key", "http://mock/data/v4", tmp_path / "cache", rate=1000, transport=transport
    )
    app = create_app(make_settings(tmp_path, auth_dev_login=True, faceit_provider="api"), provider=prov)
    with TestClient(app, base_url="http://localhost:8000") as c:
        csrf = login(c, "scout_me")
        r = c.post(
            "/api/scout", json={"url": url or mock.state.world["upcoming"]}, headers={"X-CSRF-Token": csrf}
        )
        assert r.status_code == 202, r.text
        for _ in range(600):
            j = c.get(f"/api/scout/{r.json()['id']}").json()
            if j["status"] != "running":
                return j
            time.sleep(0.1)
    raise AssertionError("timeout")


def test_unknown_match_is_a_clean_error(tmp_path):
    mock = create_mock()
    j = _run(tmp_path, mock, httpx.ASGITransport(app=mock), url="1-00000000-0000-4000-8000-000000000000")
    assert j["status"] == "error" and "не найден" in j["error"]
    assert j["stage"] == "error"


def test_partial_player_failures_do_not_break_the_report(tmp_path):
    mock = create_mock()
    w = mock.state.world
    broken = [w["smurf"].pid]
    empty = [w["duo"][0].pid]
    j = _run(tmp_path, mock, Flaky(mock, broken_players=broken, empty_stats=empty))
    assert j["status"] == "done" and j["stage"] == "done"
    rep = j["report"]
    players = {p["nickname"]: p for t in rep["teams"].values() for p in t["players"]}
    assert len(players) == 10
    assert players["planted_smurf"]["errors"] and players["planted_smurf"]["risk"]["classification"] is None
    assert players["duo_a"]["lifetime"]["matches"] is None
    assert "planted_smurf" in rep["teams"]["faction2"]["summary"]["players_missing_data"]
    assert rep["comparison"]["elo_expectation"] is not None  # still computed from the 9 known Elos


def test_rate_limit_mid_scout_marks_players_incomplete(tmp_path):
    mock = create_mock()
    j = _run(tmp_path, mock, Flaky(mock, rate_limit_after=12))
    assert j["status"] == "done"
    missing = [x for t in j["report"]["teams"].values() for x in t["summary"]["players_missing_data"]]
    assert missing  # honest: some players flagged as incomplete, no invented values
    assert all(
        "Лимит запросов" in e
        for t in j["report"]["teams"].values()
        for p in t["players"]
        for e in p["errors"]
    )


def test_unknown_status_no_map_duplicates_and_finished(tmp_path):
    mock = create_mock()
    w = mock.state.world
    d = w["details"][w["upcoming"]]
    d["status"] = "SOMETHING_NEW"
    d["voting"] = {}
    d["teams"]["faction2"]["roster"].append(
        copy.deepcopy(d["teams"]["faction2"]["roster"][0])
    )  # duplicated entry
    j = _run(tmp_path, mock, httpx.ASGITransport(app=mock))
    rep = j["report"]
    assert j["status"] == "done" and rep["phase"] == "unknown" and rep["map"] is None
    assert j["prediction"] is None  # unknown status: no snapshot that could be mistaken for pre-match
    assert len(rep["teams"]["faction2"]["players"]) == 5
    assert rep["map_pool"] and not [b for b in rep["briefing"] if b["category"] == "tactical"]


def test_finished_match_has_result_and_no_prediction(tmp_path):
    mock = create_mock()
    w = mock.state.world
    finished = next(m for m, d in w["details"].items() if d["status"] == "FINISHED")
    j = _run(tmp_path, mock, httpx.ASGITransport(app=mock), url=finished)
    assert j["report"]["phase"] == "post" and j["report"]["result"]["winner"] in ("faction1", "faction2")
    assert j["prediction"] is None


def test_job_stage_follows_real_milestones():
    from app.scout.service import job_stage

    assert job_stage("running", 0.02) == "match"
    assert job_stage("running", 0.1) == "players"
    assert job_stage("running", 0.82) == "players"
    assert job_stage("running", 0.9) == "briefing"
    assert job_stage("done", 1.0) == "done"


def test_faceit_errors_are_marked_with_their_source(tmp_path):
    """The UI tells "FACEIT unavailable / not found" apart from "this server is down"."""
    mock = create_mock()
    prov = FaceitApiProvider(
        "test-key",
        "http://mock/data/v4",
        tmp_path / "cache",
        rate=1000,
        transport=httpx.ASGITransport(app=mock),
    )
    app = create_app(make_settings(tmp_path, auth_dev_login=True, faceit_provider="api"), provider=prov)
    with TestClient(app, base_url="http://localhost:8000") as c:
        login(c, "scout_me")
        r = c.get("/api/players/no_such_player_xyz/overview")
        assert r.status_code == 404
        assert r.json()["source"] == "faceit" and r.json()["detail"]
        assert "source" not in c.get("/api/scout/000000000000").json()  # our own 404, not FACEIT's
