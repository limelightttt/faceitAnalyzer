import pytest

from app.analytics import elo, insights, matchmaking, player
from app.faceit_normalize import build_match, normalize_profile
from app.services.players import load_player_dataset
from app.synthetic import generate


async def test_overview_real(fixtures_provider, data_dir):
    ds = await load_player_dataset(fixtures_provider, "limelightttt", 50, data_dir)
    ov = player.overview(ds)
    t = ov["totals"]
    assert (t["wins"], t["losses"]) == (6, 4)
    assert t["kills"] == sum(pm.stats.kills for pm in ds.matches)
    assert len(ov["trend"]) == 10 and {m["map"] for m in ov["maps"]} >= {"de_train", "de_mirage", "de_dust2"}
    bw = player.best_worst(ds)
    assert bw["best"][0]["rating"] >= bw["worst"][0]["rating"]


async def test_insufficient_data_is_reported(fixtures_provider, data_dir):
    ds = await load_player_dataset(fixtures_provider, "limelightttt", 50, data_dir)
    mm = matchmaking.analyze(ds)
    assert mm["verdict"]["code"] == "insufficient_data"
    assert all(t["status"] == "insufficient_data" for t in mm["tests"])
    e = elo.elo_report(ds, [])
    assert e["reconstructed"] == [] and e["implied"]["available"] is False


async def test_insights_find_planted_profile(fixtures_provider, data_dir):
    # synthetic focus player is generated with strong entries, weak utility and weak clutches
    ds = await load_player_dataset(fixtures_provider, "sim_player", 300, data_dir)
    res = insights.compute_insights(ds)
    assert "Попытки entry за раунд" in res["strengths"]
    assert "Урон гранатами за раунд" in res["weaknesses"]
    assert "Клатчи 1v1" in res["weaknesses"]


async def test_elo_reconstruction_ends_at_official(fixtures_provider, data_dir):
    ds = await load_player_dataset(fixtures_provider, "sim_player", 300, data_dir)
    rep = elo.elo_report(ds, [])
    assert rep["reconstructed"][-1]["elo_after"] == ds.profile.elo
    # generator uses the same K=50 rule -> reconstruction should land near the true starting Elo (1720)
    first = rep["reconstructed"][0]
    assert abs(first["elo_after"] - first["delta"] - 1720) <= 30
    ri = rep["results_implied"]
    assert ri["available"] and ri["ci80"][0] <= ri["estimate"] <= ri["ci80"][1]
    # the synthetic player is underrated (true skill above Elo) -> estimate above official Elo
    assert ri["estimate"] > ds.profile.elo
    assert "available" in rep["implied"]  # may be unreliable when lobby levels barely vary
    proj = rep["projection"]["series"]
    assert all(s["p10"] <= s["p50"] <= s["p90"] for s in proj)


def _dataset_from_generated(data):
    from app.analytics.party import infer_parties
    from app.domain import DataQuality, PlayerDataset, PlayerMatch

    prof = normalize_profile(data["profile"])
    matches = []
    for item in data["history"]:
        m = build_match(
            item["match_id"], item, data["details"][item["match_id"]], data["stats"][item["match_id"]]
        )
        idx = next(i for i, t in enumerate(m.teams) if any(p.player_id == prof.player_id for p in t.players))
        team, opp = m.teams[idx], m.teams[1 - idx]
        me = next(p for p in team.players if p.player_id == prof.player_id)
        matches.append(
            PlayerMatch(
                match=m,
                team_index=idx,
                won=m.winner_team_id == team.team_id,
                stats=me.stats,
                team_avg_elo=team.avg_elo,
                opp_avg_elo=opp.avg_elo,
                win_probability=team.win_probability,
                party_size=1,
            )
        )
    infer_parties(matches, prof.player_id)
    q = DataQuality(
        source="synthetic",
        matches_requested=len(matches),
        matches_loaded=len(matches),
        matches_with_stats=len(matches),
        has_timestamps=True,
        has_team_elo=True,
        has_official_elo=True,
    )
    return PlayerDataset(profile=prof, matches=matches, quality=q)


@pytest.mark.parametrize("seed", [21, 22, 23])
def test_matchmaking_null_has_no_hidden_pool_anomaly(seed):
    ds = _dataset_from_generated(generate(seed=seed, n_matches=200))
    res = matchmaking.analyze(ds)
    by_id = {t["id"]: t for t in res["tests"]}
    for tid in ("streak_opponents", "streak_residual"):
        assert by_id[tid]["status"] != "anomaly", (seed, by_id[tid])


def test_matchmaking_detects_planted_effect():
    ds = _dataset_from_generated(generate(seed=21, n_matches=250, hidden_pool_strength=1.5))
    res = matchmaking.analyze(ds)
    by_id = {t["id"]: t for t in res["tests"]}
    # planted: stronger hidden opponents after win streaks -> worse results than Elo expects
    assert by_id["streak_residual"]["status"] in ("anomaly", "weak_signal")
    assert by_id["streak_residual"]["statistic"] < 0
    assert res["verdict"]["code"] in ("anomaly", "no_evidence")
    assert "не доказательство" in res["verdict"]["text"] or res["verdict"]["code"] == "no_evidence"
