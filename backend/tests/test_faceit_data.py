import json

import httpx
import pytest

from app.analytics.rating import hltv_rating_1
from app.domain import PlayerMatchStats
from app.providers.base import PlayerNotFound, ProviderError
from app.providers.faceit_api import FaceitApiProvider
from app.services.players import load_player_dataset


async def test_real_snapshot_dataset(fixtures_provider, data_dir):
    ds = await load_player_dataset(fixtures_provider, "limelightttt", 50, data_dir)
    assert ds.quality.source == "real_snapshot"
    assert ds.quality.matches_loaded == 10 and ds.quality.matches_with_stats == 10
    assert not ds.quality.has_team_elo and not ds.quality.has_official_elo
    first = ds.matches[0]  # newest first, as stored by the legacy bot
    assert first.match.match_id == "1-c55150e2-8da7-41fe-a6e0-64e1b1f4915f"
    assert first.match.map == "de_train" and first.match.rounds == 19
    assert first.stats.kills == 12 and first.stats.deaths == 16 and first.stats.adr == pytest.approx(79.1)
    assert first.won is False and (first.score_for, first.score_against) == (6, 13)
    # the legacy analyzer summed the *first* player of every match; we must pick the requested one
    assert all(pm.stats.nickname == "limelightttt" for pm in ds.matches)


async def test_synthetic_dataset_has_elo_and_time(fixtures_provider, data_dir):
    ds = await load_player_dataset(fixtures_provider, "sim_player", 300, data_dir)
    assert ds.quality.source == "synthetic"
    assert ds.quality.matches_loaded == 150
    assert ds.quality.has_team_elo and ds.quality.has_timestamps and ds.profile.elo is not None
    assert all(0 < pm.win_probability < 1 for pm in ds.matches)


def test_hltv_rating_reference():
    # 20 kills/16 deaths/24 rounds, 4 doubles, 1 triple -> hand-computed 1.2075
    s = PlayerMatchStats(player_id="x", nickname="x", kills=20, deaths=16, double_kills=4, triple_kills=1)
    singles = 20 - 8 - 3
    expected = (20 / 24 / 0.679 + 0.7 * (8 / 24) / 0.317 + (singles + 16 + 9) / 24 / 1.277) / 2.7
    assert hltv_rating_1(s, 24) == pytest.approx(round(expected, 3))


def _api(handler, tmp_path) -> FaceitApiProvider:
    return FaceitApiProvider(
        "k", "https://open.faceit.com/data/v4", tmp_path, rate=1000, transport=httpx.MockTransport(handler)
    )


async def test_api_pagination_and_auth_header(tmp_path):
    seen = []

    def handler(req: httpx.Request):
        seen.append(req)
        assert req.headers["Authorization"] == "Bearer k"
        off, lim = int(req.url.params["offset"]), int(req.url.params["limit"])
        total = 130
        items = [{"match_id": f"m{i}"} for i in range(off, min(off + lim, total))]
        return httpx.Response(200, json={"items": items})

    api = _api(handler, tmp_path)
    items = await api.get_history("pid", 130)
    assert len(items) == 130 and items[-1]["match_id"] == "m129"
    assert [int(r.url.params["offset"]) for r in seen] == [0, 100]


async def test_api_retries_429_and_caches(tmp_path, monkeypatch):
    calls = {"n": 0}

    async def no_sleep(_):
        return None

    monkeypatch.setattr("app.providers.faceit_api.asyncio.sleep", no_sleep)

    def handler(req):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "1"})
        return httpx.Response(200, json={"match_id": "m1"})

    api = _api(handler, tmp_path)
    assert (await api.get_match("m1"))["match_id"] == "m1"
    assert (await api.get_match("m1"))["match_id"] == "m1"  # served from immutable cache
    assert calls["n"] == 2


async def test_api_errors(tmp_path):
    api = _api(lambda req: httpx.Response(401, json={}), tmp_path)
    with pytest.raises(ProviderError, match="FACEIT_API_KEY"):
        await api.get_match_stats("m")
    api404 = _api(lambda req: httpx.Response(404, json={}), tmp_path / "b")
    with pytest.raises(PlayerNotFound):
        await api404.get_player("ghost")
    # secrets never appear in error messages
    try:
        await api.get_match_stats("m")
    except ProviderError as e:
        assert "Bearer" not in str(e) and json.dumps(str(e)).find(" k ") == -1


async def test_api_serves_stale_cache_when_live_api_fails(tmp_path, monkeypatch):
    from app.providers.base import fetch_log, freshness_summary

    async def no_sleep(_):
        return None

    monkeypatch.setattr("app.providers.faceit_api.asyncio.sleep", no_sleep)
    state = {"down": False}

    def handler(req):
        if state["down"]:
            return httpx.Response(503)
        return httpx.Response(200, json={"player_id": "p1", "nickname": "x"})

    api = FaceitApiProvider(
        "k",
        "https://open.faceit.com/data/v4",
        tmp_path,
        rate=1000,
        transport=httpx.MockTransport(handler),
        profile_ttl=0,
    )
    assert (await api.get_player("x"))["player_id"] == "p1"
    state["down"] = True
    log = []
    tok = fetch_log.set(log)
    try:
        assert (await api.get_player("x"))["player_id"] == "p1"  # expired cache, API down -> stale copy
    finally:
        fetch_log.reset(tok)
    assert freshness_summary(log)["stale"] is True
    with pytest.raises(ProviderError):
        await api.get_player("never-cached")


async def test_rate_limit_sets_cooldown_and_reports_when(tmp_path, monkeypatch):
    from app.providers.faceit_api import RateLimited

    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        if req.url.path.endswith("/players") and req.url.params.get("nickname") == "cached":
            return httpx.Response(200, json={"player_id": "p1", "nickname": "cached"})
        return httpx.Response(429, headers={"Retry-After": "120"})

    api = FaceitApiProvider(
        "k",
        "https://open.faceit.com/data/v4",
        tmp_path,
        rate=1000,
        transport=httpx.MockTransport(handler),
        profile_ttl=0,
    )
    assert (await api.get_player("cached"))["player_id"] == "p1"
    with pytest.raises(RateLimited) as e:
        await api.get_match("m1")
    assert e.value.status == 429 and "мин" in str(e.value)
    n = calls["n"]
    # during the cooldown the API is not called again; expired cache is served instead
    assert (await api.get_player("cached"))["player_id"] == "p1"
    with pytest.raises(RateLimited):
        await api.get_match("m2")
    assert calls["n"] == n
    assert api.rate_limit_status()["limited"] and 100 < api.rate_limit_status()["retry_in_s"] <= 120


def test_retry_after_parsing():
    from app.providers.faceit_api import retry_after_seconds

    assert retry_after_seconds({"Retry-After": "30"}, 5) == 30
    assert 50 < retry_after_seconds({"Retry-After": "Wed, 21 Oct 2099 07:28:00 GMT"}, 5)
    assert retry_after_seconds({"Retry-After": "garbage"}, 7) == 7
    assert retry_after_seconds({}, 60) == 60


async def test_dataset_survives_rate_limit_mid_way(tmp_path):
    from app.services.players import load_player_dataset
    from tests.support.mock_faceit import create_mock

    mock = create_mock()
    inner = httpx.ASGITransport(app=mock)
    state = {"n": 0}

    class Flaky(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            state["n"] += 1
            if "/matches/" in request.url.path and state["n"] > 25:
                return httpx.Response(429, headers={"Retry-After": "600"})
            return await inner.handle_async_request(request)

    api = FaceitApiProvider(
        "test-key", "http://mock/data/v4", tmp_path, rate=1000, concurrency=1, transport=Flaky()
    )
    ds = await load_player_dataset(api, "scout_me", 40, tmp_path)
    assert 0 < ds.quality.matches_loaded and any("Лимит запросов" in n for n in ds.quality.notes)


async def test_reads_cache_written_by_first_app_version(tmp_path):
    """Phase 1 stored the bare payload; it must still be served (regression: KeyError 'at' -> HTTP 500)."""
    import hashlib

    def handler(req):
        raise AssertionError("must be served from the legacy cache")

    api = FaceitApiProvider(
        "k", "https://open.faceit.com/data/v4", tmp_path, rate=1000, transport=httpx.MockTransport(handler)
    )
    key = "/matches/m1?" + json.dumps({}, sort_keys=True)
    (tmp_path / (hashlib.sha1(key.encode()).hexdigest() + ".json")).write_text(
        json.dumps({"match_id": "m1", "status": "FINISHED"})
    )
    assert (await api.get_match("m1"))["match_id"] == "m1"
    # a corrupt cache file is dropped and refetched instead of crashing
    key2 = "/matches/m2?" + json.dumps({}, sort_keys=True)
    bad = tmp_path / (hashlib.sha1(key2.encode()).hexdigest() + ".json")
    bad.write_text("{not json")
    api2 = FaceitApiProvider(
        "k",
        "https://open.faceit.com/data/v4",
        tmp_path,
        rate=1000,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"match_id": "m2"})),
    )
    assert (await api2.get_match("m2"))["match_id"] == "m2"


async def test_cancelled_caller_does_not_break_joined_waiters(tmp_path):
    """Regression: a request abandoned by the browser cancelled the shared FACEIT call and killed the
    Match Scout job that had joined it (job stuck at 'running' forever)."""
    import asyncio

    gate = asyncio.Event()

    async def slow_handler(request):
        await gate.wait()
        return httpx.Response(200, json={"player_id": "p1", "nickname": "x"})

    class T(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            return await slow_handler(request)

    api = FaceitApiProvider("k", "https://open.faceit.com/data/v4", tmp_path, rate=1000, transport=T())
    first = asyncio.create_task(api.get_player_by_id("p1"))
    await asyncio.sleep(0.01)
    second = asyncio.create_task(api.get_player_by_id("p1"))
    await asyncio.sleep(0.01)
    first.cancel()
    await asyncio.sleep(0.01)
    gate.set()
    assert (await asyncio.wait_for(second, 5))["player_id"] == "p1"
    assert api._inflight == {}
