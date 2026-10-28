"""Regression tests for defects found in the private-beta review."""

import gzip
import sqlite3
import time

import httpx
import pytest
import zstandard
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import Database, TacticalSample
from app.main import create_app
from app.providers.faceit_api import FaceitApiProvider
from tests.conftest import SAMPLE_DEMO, login, make_settings
from tests.support.mock_faceit import create_mock


def _app(tmp_path, mock=None, **kw):
    mock = mock or create_mock()
    prov = FaceitApiProvider(
        "test-key",
        "http://mock/data/v4",
        tmp_path / "cache",
        rate=1000,
        transport=httpx.ASGITransport(app=mock),
    )
    settings = make_settings(tmp_path, auth_dev_login=True, faceit_provider="api", **kw)
    return create_app(settings, provider=prov), mock


def _client(app):
    return TestClient(app, base_url="http://localhost:8000")


def _wait_scout(c, sid):
    for _ in range(600):
        r = c.get(f"/api/scout/{sid}").json()
        if r.get("status") in ("done", "error"):
            return r
        time.sleep(0.1)
    raise AssertionError("timeout")


def _wait_demo(c, demo_id):
    for _ in range(1200):
        m = c.get(f"/api/demos/{demo_id}").json()["meta"]
        if m["status"] not in ("queued", "parsing"):
            return m
        time.sleep(0.1)
    raise AssertionError("timeout")


def test_login_required_for_data_endpoints(tmp_path):
    app, _ = _app(tmp_path, require_login=True)
    with _client(app) as c:
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/auth/me").json()["authenticated"] is False
        for path in ("/api/players/scout_me/overview", "/api/demos", "/api/maps/de_mirage", "/api/scout/abc"):
            assert c.get(path).status_code == 401, path
        assert c.post("/api/scout", json={"url": "1-0acdf87b-7a65-4c1e-9736-f6614ab5d7f2"}).status_code == 401
        assert c.delete("/api/demos/sample00mirage").status_code == 401
        login(c, "scout_me")
        assert c.get("/api/players/scout_me/overview").status_code == 200


def test_beta_allowlist(tmp_path):
    app, _ = _app(tmp_path, require_login=True, beta_allowlist="scout_me, 76561198000000001")
    with _client(app) as ok, _client(app) as denied:
        login(ok, "scout_me")
        r = denied.post("/api/auth/dev-login", json={"faceit_nickname": "mate_0"}, follow_redirects=False)
        assert r.status_code == 403
        assert denied.get("/api/auth/me").json()["authenticated"] is False


def test_users_cannot_see_each_others_scouts_predictions_or_demos(tmp_path):
    app, mock = _app(tmp_path, require_login=True)
    up = mock.state.world["upcoming"]
    with _client(app) as a, _client(app) as b:
        ca, cb = login(a, "scout_me"), login(b, "mate_0")
        sid = a.post("/api/scout", json={"url": up}, headers={"X-CSRF-Token": ca}).json()["id"]
        assert _wait_scout(a, sid)["status"] == "done"
        assert b.get(f"/api/scout/{sid}").status_code == 404
        pid = a.get("/api/predictions").json()[0]["id"]
        assert b.get("/api/predictions").json() == []
        fb = b.post(
            "/api/feedback",
            json={"prediction_id": pid, "target": "x", "verdict": "correct"},
            headers={"X-CSRF-Token": cb},
        )
        assert fb.status_code == 404
        assert b.get("/api/me/history").json() == [] or all(
            h["ref"] != sid for h in b.get("/api/me/history").json()
        )
        r = a.post("/api/demos", files={"file": ("x.dem", b"not a demo")}, headers={"X-CSRF-Token": ca})
        demo_id = r.json()["id"]
        assert b.get(f"/api/demos/{demo_id}").status_code == 404
        assert b.delete(f"/api/demos/{demo_id}", headers={"X-CSRF-Token": cb}).status_code == 404
        assert all(d["id"] != demo_id for d in b.get("/api/demos").json())
        assert any(d["id"] == "sample00mirage" for d in b.get("/api/demos").json())
        assert a.delete("/api/demos/sample00mirage", headers={"X-CSRF-Token": ca}).status_code == 403


@pytest.mark.skipif(not SAMPLE_DEMO.exists(), reason="sample demo not downloaded")
def test_same_match_uploaded_twice_is_counted_once(tmp_path):
    app, _ = _app(tmp_path)
    data = SAMPLE_DEMO.read_bytes()
    gz = tmp_path / "again.dem.gz"
    gz.write_bytes(gzip.compress(data, compresslevel=1))
    with _client(app) as c:
        csrf = login(c, "scout_me")
        h = {"X-CSRF-Token": csrf}
        db = app.state.ctx.db

        def keys():
            with db.session() as s:
                return s.scalar(select(func.count(func.distinct(TacticalSample.demo_id))))

        assert keys() == 1  # bundled sample (same real demo)
        first = c.post("/api/demos", files={"file": ("a.dem", data)}, headers=h).json()
        assert _wait_demo(c, first["id"])["status"] == "done"
        second = c.post("/api/demos", files={"file": ("b.dem", data)}, headers=h).json()
        assert second.get("duplicate") is True and second["id"] == first["id"]
        third = c.post("/api/demos", files={"file": ("c.dem.gz", gz.read_bytes())}, headers=h).json()
        assert _wait_demo(c, third["id"])["status"] == "done"
        assert keys() == 1  # different file, same match -> same fingerprint
        assert c.delete(f"/api/demos/{third['id']}", headers=h).status_code == 204
        assert keys() == 1  # still referenced by the others


@pytest.mark.skipif(not SAMPLE_DEMO.exists(), reason="sample demo not downloaded")
def test_repeat_download_name_is_still_a_demo(tmp_path):
    """Regression: a browser saves a second download of "x.dem.zst" as "x.dem (1).zst" and it was refused."""
    app, _ = _app(tmp_path)
    packed = zstandard.ZstdCompressor(level=1).compress(SAMPLE_DEMO.read_bytes())
    with _client(app) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        r = c.post("/api/demos", files={"file": ("x.dem (1).zst", packed)}, headers=h)
        assert r.status_code == 202
        assert _wait_demo(c, r.json()["id"])["status"] == "done"


def test_decompression_bomb_and_corrupt_archives_are_rejected(tmp_path):
    app, _ = _app(tmp_path)
    app.state.ctx.demos.max_decompressed_bytes = 5 * 1024 * 1024
    bomb = gzip.compress(b"\0" * (20 * 1024 * 1024))
    with _client(app) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        r = c.post("/api/demos", files={"file": ("bomb.dem.gz", bomb)}, headers=h).json()
        m = _wait_demo(c, r["id"])
        assert m["status"] == "error" and "Распакованный файл больше" in m["error"]
        assert not list((tmp_path / "demos" / r["id"]).glob("*.dem*"))  # nothing left on disk
        r = c.post(
            "/api/demos", files={"file": ("bad.dem.zst", b"\x28\xb5\x2f\xfdgarbage")}, headers=h
        ).json()
        assert _wait_demo(c, r["id"])["status"] == "error"
        assert c.post("/api/demos", files={"file": ("x.zip", b"PK")}, headers=h).status_code == 400
        assert c.post("/api/demos", files={"file": ("e.dem", b"")}, headers=h).status_code == 400
        r = c.post("/api/demos", files={"file": ("../../etc/passwd.dem", b"x")}, headers=h).json()
        assert (tmp_path / "demos" / r["id"]).exists() and r["file_name"] == "passwd.dem"


@pytest.mark.skipif(not SAMPLE_DEMO.exists(), reason="sample demo not downloaded")
def test_parse_timeout_kills_worker_and_pipeline_recovers(tmp_path):
    app, _ = _app(tmp_path)
    store = app.state.ctx.demos
    with _client(app) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        store.parse_timeout_s = 0.5
        r = c.post("/api/demos", files={"file": ("slow.dem", SAMPLE_DEMO.read_bytes())}, headers=h).json()
        time.sleep(1.0)
        m = _wait_demo(c, r["id"])
        assert m["status"] == "error" and "не уложился" in m["error"]
        store.parse_timeout_s = 600
        r2 = c.post(
            "/api/demos",
            files={"file": ("next.dem.gz", gzip.compress(SAMPLE_DEMO.read_bytes(), 1))},
            headers=h,
        ).json()
        assert _wait_demo(c, r2["id"])["status"] == "done"


def test_restart_keeps_user_data_and_fails_interrupted_jobs(tmp_path):
    mock = create_mock()
    app, _ = _app(tmp_path, mock=mock)
    with _client(app) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        assert (
            c.put(
                "/api/me/settings", json={"sample_size": 20, "preferred_maps": ["de_nuke"]}, headers=h
            ).status_code
            == 200
        )
        sid = c.post("/api/scout", json={"url": mock.state.world["upcoming"]}, headers=h).json()["id"]
        _wait_scout(c, sid)
        cookies = dict(c.cookies)
    from app.db import ScoutReport

    with app.state.ctx.db.session() as s:
        s.add(ScoutReport(id="deadbeef0001", match_id="m", user_id=1, status="running"))
    app2, _ = _app(tmp_path, mock=mock)  # "restart": new process state, same data dir
    with _client(app2) as c2:
        c2.cookies.update(cookies)
        assert c2.get("/api/auth/me").json()["authenticated"] is True
        assert c2.get("/api/me/settings").json()["preferred_maps"] == ["de_nuke"]
        assert len(c2.get("/api/predictions").json()) == 1
        r = c2.get("/api/scout/deadbeef0001").json()
        assert r["status"] == "error" and "перезапуском" in r["error"]


def test_migration_adds_columns_to_existing_database(tmp_path):
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE player_snapshots (id INTEGER PRIMARY KEY, player_id VARCHAR(64), taken_at DATETIME, "
        "elo INTEGER, level INTEGER, matches INTEGER)"
    )
    con.execute("INSERT INTO player_snapshots (player_id, elo) VALUES ('p', 2000)")
    con.commit()
    con.close()
    Database(f"sqlite:///{path}")
    con = sqlite3.connect(path)
    cols = {r[1] for r in con.execute("PRAGMA table_info(player_snapshots)")}
    assert "confirmed_at" in cols and con.execute("SELECT elo FROM player_snapshots").fetchone()[0] == 2000
    assert con.execute("PRAGMA user_version").fetchone()[0] >= 2
    Database(f"sqlite:///{path}")  # idempotent


def test_auth_callback_errors_return_to_the_app_for_browsers(tmp_path):
    app, _ = _app(tmp_path)
    with _client(app) as c:
        r = c.get(
            "/api/auth/steam/callback?state=nope", headers={"accept": "text/html"}, follow_redirects=False
        )
        assert r.status_code == 303 and r.headers["location"].startswith("/?auth_error=")
        assert c.get("/api/auth/steam/callback?state=nope").status_code == 400  # API clients still get JSON


def test_idle_and_absolute_session_expiry(tmp_path):
    from datetime import timedelta

    from app.db import AuthSession, utcnow

    app, _ = _app(tmp_path, require_login=True)
    with _client(app) as c:
        login(c, "scout_me")
        with app.state.ctx.db.session() as s:
            row = s.query(AuthSession).one()
            row.last_seen_at = utcnow() - timedelta(hours=app.state.ctx.settings.session_idle_hours + 1)
        assert c.get("/api/players/scout_me/overview").status_code == 401
        assert c.get("/api/auth/me").json()["authenticated"] is False
        login(c, "scout_me")
        with app.state.ctx.db.session() as s:
            row = s.query(AuthSession).one()
            row.expires_at = utcnow() - timedelta(seconds=1)
        assert c.get("/api/auth/me").json()["authenticated"] is False
