import httpx

from app.db import Database, GameProfile, PlayerSnapshot, User
from app.providers.faceit_api import FaceitApiProvider
from app.services.players import load_snapshots
from app.tracking import run_once
from tests.support.mock_faceit import create_mock


async def test_tracking_dedupes_and_records_real_changes(tmp_path):
    mock = create_mock()
    w = mock.state.world
    api = FaceitApiProvider(
        "test-key",
        "http://mock/data/v4",
        tmp_path / "c",
        rate=1000,
        transport=httpx.ASGITransport(app=mock),
        profile_ttl=0,
    )
    db = Database(f"sqlite:///{tmp_path}/t.db")
    with db.session() as s:
        for _ in range(2):  # two users who both play as the same FACEIT account
            u = User()
            s.add(u)
            s.flush()
            s.add(GameProfile(user_id=u.id, faceit_player_id=w["me"].pid, nickname="scout_me", source="dev"))
    r1 = await run_once(api, db, pause_s=0)
    r2 = await run_once(api, db, pause_s=0)
    assert r1 == {"players": 1, "new": 1, "confirmed": 0, "errors": 0, "skipped_rate_limit": 0}
    assert r2["confirmed"] == 1 and r2["new"] == 0
    w["me"].elo += 23  # real change on FACEIT
    assert (await run_once(api, db, pause_s=0))["new"] == 1
    snaps = load_snapshots(db, w["me"].pid)
    assert [s_["elo"] for s_ in snaps] == [round(w["me"].elo - 23), round(w["me"].elo)]
    assert all(s_["confirmed_at"] for s_ in snaps)
    import time

    api._cooldown_until = time.time() + 600  # FACEIT said 429: tracker must not call the API at all
    assert (await run_once(api, db, pause_s=0))["skipped_rate_limit"] == 1
    with db.session() as s:
        assert s.query(PlayerSnapshot).count() == 2


async def test_pending_predictions_are_checked_in_the_background(tmp_path):
    import time

    from app.db import Prediction, PredictionOutcome
    from app.tracking import check_predictions

    mock = create_mock()
    w = mock.state.world
    api = FaceitApiProvider(
        "test-key", "http://mock/data/v4", tmp_path / "c", rate=1000, transport=httpx.ASGITransport(app=mock)
    )
    db = Database(f"sqlite:///{tmp_path}/t.db")
    with db.session() as s:
        u = User()
        s.add(u)
        s.flush()
        s.add(
            Prediction(
                match_id=w["upcoming"],
                scout_id="s1",
                user_id=u.id,
                match_status_at_prediction="READY",
                pre_match=True,
                algo_version="t",
                input_hash="h",
                payload={"elo_expectation_faction1": 0.6, "favoured": "faction1"},
            )
        )
    assert (await check_predictions(api, db))["resolved"] == 0  # match not finished yet
    transport = httpx.ASGITransport(app=mock)
    async with httpx.AsyncClient(transport=transport, base_url="http://mock") as c:
        await c.post(f"/admin/finish/{w['upcoming']}", json={"winner": "faction1"})
    api._cooldown_until = time.time() + 600  # FACEIT said 429: no calls at all
    assert (await check_predictions(api, db))["skipped_rate_limit"] == 1
    api._cooldown_until = 0
    api2 = FaceitApiProvider(  # fresh cache: the live match was cached for 20 s
        "test-key", "http://mock/data/v4", tmp_path / "c2", rate=1000, transport=transport
    )
    assert (await check_predictions(api2, db))["resolved"] == 1
    with db.session() as s:
        assert s.query(PredictionOutcome).one().winner_faction == "faction1"
