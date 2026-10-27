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
    with pytest.raises(ProviderError, match="API key"):
        await api.get_match_stats("m")
    api404 = _api(lambda req: httpx.Response(404, json={}), tmp_path / "b")
    with pytest.raises(PlayerNotFound):
        await api404.get_player("ghost")
    # secrets never appear in error messages
    try:
        await api.get_match_stats("m")
    except ProviderError as e:
        assert "Bearer" not in str(e) and json.dumps(str(e)).find(" k ") == -1
