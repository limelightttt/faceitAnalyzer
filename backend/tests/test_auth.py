"""Auth flows with mocked Steam / FACEIT endpoints (the real providers are not reachable from CI)."""

from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_settings

STEAM = "https://steamcommunity.com/openid/login"
STEAM_ID = "76561198000000042"


def _transport(valid: bool = True, guid: str = "faceit-guid-1"):
    def handler(req: httpx.Request):
        if req.url.host == "steamcommunity.com":
            body = req.content.decode()
            assert "openid.mode=check_authentication" in body
            return httpx.Response(
                200, text=f"ns:http://specs.openid.net/auth/2.0\nis_valid:{'true' if valid else 'false'}\n"
            )
        if req.url.path.endswith("/oauth/token"):
            assert req.headers["authorization"].startswith("Basic ")
            form = parse_qs(req.content.decode())
            assert form["grant_type"] == ["authorization_code"] and form["code_verifier"][0]
            return httpx.Response(200, json={"access_token": "at", "token_type": "bearer"})
        if req.url.path.endswith("/userinfo"):
            return httpx.Response(200, json={"guid": guid, "nickname": "oauth_nick"})
        return httpx.Response(404)

    return httpx.MockTransport(handler)


@pytest.fixture
def client(tmp_path):
    app = create_app(make_settings(tmp_path, faceit_client_id="cid", faceit_client_secret="csecret"))
    app.state.ctx.auth_transport = _transport()
    with TestClient(app, base_url="http://localhost:8000") as c:
        yield c, app


def _cb(c: TestClient, return_to: str, params: dict[str, str]):
    """Steam appends the openid.* parameters to our return_to URL (which carries `state`)."""
    path = urlparse(return_to)
    merged = {k: v[0] for k, v in parse_qs(path.query).items()} | params
    return c.get(path.path, params=merged, follow_redirects=False)


def _steam_assertion(start_location: str, steam_id: str = STEAM_ID) -> dict[str, str]:
    q = parse_qs(urlparse(start_location).query)
    return_to = q["openid.return_to"][0]
    claimed = f"https://steamcommunity.com/openid/id/{steam_id}"
    return return_to, {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "id_res",
        "openid.op_endpoint": STEAM,
        "openid.claimed_id": claimed,
        "openid.identity": claimed,
        "openid.return_to": return_to,
        "openid.response_nonce": "2026-10-27T10:00:00Zabc",
        "openid.assoc_handle": "1234567890",
        "openid.signed": "signed,op_endpoint,claimed_id",
        "openid.sig": "c2ln",
    }


def steam_login(c: TestClient, steam_id: str = STEAM_ID, link: bool = False):
    r = c.get(
        f"/api/auth/steam/start?return_to=/scout&link={'true' if link else 'false'}", follow_redirects=False
    )
    assert r.status_code == 302 and r.headers["location"].startswith(STEAM)
    return_to, params = _steam_assertion(r.headers["location"], steam_id)
    return _cb(c, return_to, params)


def test_steam_login_creates_session_and_detects_faceit_profile(client):
    c, app = client
    r = steam_login(
        c, "76561198000000001"
    )  # synthetic fixture player with this SteamID? (none) -> no profile
    assert r.status_code == 302 and r.headers["location"] == "/scout"
    cookie = r.headers.get("set-cookie", "")
    assert "fi_session=" in cookie and "httponly" in cookie.lower() and "samesite=lax" in cookie.lower()
    me = c.get("/api/auth/me").json()
    assert me["authenticated"] and me["identities"][0]["provider"] == "steam"
    assert me["identities"][0]["subject"] == "76561198000000001"
    assert "csrf_token" in me and me["game_profile"] is None


def test_steam_profile_lookup_via_faceit(client):
    c, app = client
    steam_id = app.state.ctx.provider._by_nick["sim_player"][1]["games"]["cs2"]["game_player_id"]
    steam_login(c, steam_id)
    me = c.get("/api/auth/me").json()
    assert me["game_profile"]["nickname"] == "sim_player" and me["game_profile"]["source"] == "steam_lookup"


def test_steam_invalid_signature_and_replay_rejected(client):
    c, app = client
    app.state.ctx.auth_transport = _transport(valid=False)
    assert steam_login(c).status_code == 400
    app.state.ctx.auth_transport = _transport(valid=True)
    r = c.get("/api/auth/steam/start", follow_redirects=False)
    return_to, params = _steam_assertion(r.headers["location"])
    assert _cb(c, return_to, params).status_code == 302
    # same state again -> single use
    assert _cb(c, return_to, params).status_code == 400


def test_login_csrf_binding_cookie_required(client):
    c, app = client
    r = c.get("/api/auth/steam/start", follow_redirects=False)
    return_to, params = _steam_assertion(r.headers["location"])
    c.cookies.delete("fi_oauth_binding")
    assert _cb(c, return_to, params).status_code == 400


def test_session_rotation_logout_requires_csrf(client):
    c, _ = client
    steam_login(c)
    first = c.cookies.get("fi_session")
    steam_login(c)
    assert c.cookies.get("fi_session") != first  # rotated on every login
    assert c.post("/api/auth/logout").status_code == 403  # no CSRF header
    csrf = c.get("/api/auth/me").json()["csrf_token"]
    r = c.post("/api/auth/logout", headers={"X-CSRF-Token": csrf}, follow_redirects=False)
    assert r.status_code == 303
    assert c.get("/api/auth/me").json()["authenticated"] is False


def test_faceit_oauth_pkce_and_linking_rules(client):
    c, app = client
    steam_login(c)  # user 1 via Steam
    r = c.get("/api/auth/faceit/start?link=true", follow_redirects=False)
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert (
        q["code_challenge_method"] == ["S256"]
        and q["client_id"] == ["cid"]
        and "client_secret" not in r.headers["location"]
    )
    cb = c.get(
        "/api/auth/faceit/callback", params={"code": "abc", "state": q["state"][0]}, follow_redirects=False
    )
    assert cb.status_code == 302
    me = c.get("/api/auth/me").json()
    assert {i["provider"] for i in me["identities"]} == {"steam", "faceit"}
    assert (
        me["game_profile"]["source"] == "faceit_oauth"
        and me["game_profile"]["faceit_player_id"] == "faceit-guid-1"
    )

    # another browser/user logs in with a different Steam account and tries to link the SAME FACEIT account
    with TestClient(app, base_url="http://localhost:8000") as other:
        steam_login(other, "76561198000000099")
        r2 = other.get("/api/auth/faceit/start?link=true", follow_redirects=False)
        st = parse_qs(urlparse(r2.headers["location"]).query)["state"][0]
        assert (
            other.get(
                "/api/auth/faceit/callback", params={"code": "x", "state": st}, follow_redirects=False
            ).status_code
            == 409
        )


def test_unlink_last_identity_refused_and_settings_persist(client):
    c, _ = client
    steam_login(c)
    csrf = c.get("/api/auth/me").json()["csrf_token"]
    assert c.delete("/api/auth/identities/steam", headers={"X-CSRF-Token": csrf}).status_code == 409
    assert c.put("/api/me/settings", json={"sample_size": 50}).status_code == 403
    r = c.put(
        "/api/me/settings",
        json={"sample_size": 50, "preferred_maps": ["de_mirage"]},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 200
    assert c.get("/api/me/settings").json()["preferred_maps"] == ["de_mirage"]
    assert (
        c.put("/api/me/settings", json={"sample_size": 7}, headers={"X-CSRF-Token": csrf}).status_code == 422
    )


def test_open_redirect_and_foreign_origin_blocked(client):
    c, _ = client
    r = steam_login(c)
    r = c.get("/api/auth/steam/start?return_to=//evil.com", follow_redirects=False)
    return_to, params = _steam_assertion(r.headers["location"])
    assert _cb(c, return_to, params).headers["location"] == "/"
    csrf = c.get("/api/auth/me").json()["csrf_token"]
    bad = c.post("/api/auth/logout", headers={"X-CSRF-Token": csrf, "Origin": "https://evil.example"})
    assert bad.status_code == 403


def test_dev_login_disabled_by_default(client):
    c, _ = client
    assert c.post("/api/auth/dev-login", json={"faceit_nickname": "sim_player"}).status_code == 404


def test_faceit_not_configured_message(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app, base_url="http://localhost:8000") as c:
        r = c.get("/api/auth/faceit/start", follow_redirects=False)
        assert r.status_code == 503 and "FACEIT_CLIENT_ID" in r.json()["detail"]
        assert c.get("/api/auth/me").json()["providers"]["faceit"]["configured"] is False
