"""Risk model validation on the simulated world: there are no real violation labels, so we measure
(1) how often ordinary players get flagged (false-alarm rate under the null) and (2) whether the planted,
documented outlier is found. This validates statistical unusualness detection — not cheat detection."""

import random

from app.scout import chemistry, risk
from app.scout.features import build_features
from tests.support.world import build_world, lifetime, profile


def _features(world, pid_list, faction_of):
    by_id = {p.pid: p for p in world["people"]}
    out = []
    for pid in pid_list:
        q = by_id[pid]
        hist = [world["history"][m] for m in reversed(q.history)][:30]
        out.append(
            build_features(
                faction_of[pid],
                {"player_id": pid, "nickname": q.nick},
                profile(q),
                lifetime(q),
                list(reversed(q.stats))[:30],
                hist,
            )
        )
    return out


def test_false_alarm_rate_and_planted_outlier():
    world = build_world()
    rng = random.Random(1)
    lobbies = rng.sample(list(world["details"].values()), 120)
    ordinary_flags = ordinary = smurf_seen = smurf_flagged = 0
    for d in lobbies:
        if d["status"] != "FINISHED":
            continue
        faction_of = {r["player_id"]: fk for fk in ("faction1", "faction2") for r in d["teams"][fk]["roster"]}
        feats = _features(world, list(faction_of), faction_of)
        pairs = {
            fk: chemistry.team_pairs([f for f in feats if f.faction == fk]) for fk in ("faction1", "faction2")
        }
        for f in feats:
            rk = risk.player_risk(f, feats, pairs[f.faction])
            if f.nickname == "planted_smurf":
                smurf_seen += 1
                smurf_flagged += bool(rk["classification"])
            else:
                ordinary += 1
                ordinary_flags += bool(rk["classification"])
    print(f"RISK-VALIDATION ordinary_flags={ordinary_flags}/{ordinary} smurf={smurf_flagged}/{smurf_seen}")
    assert ordinary > 900
    assert ordinary_flags / ordinary < 0.01, (ordinary_flags, ordinary)
    assert smurf_seen >= 5 and smurf_flagged / smurf_seen >= 0.8, (smurf_flagged, smurf_seen)


def test_small_sample_is_not_suspicion():
    world = build_world()
    q = world["people"][10]
    f = build_features("faction1", {"player_id": q.pid, "nickname": q.nick}, profile(q), None, [], [])
    rk = risk.player_risk(f, [f], [])
    assert rk["classification"] is None and rk["signals"] == []


def test_veteran_with_few_cs2_matches_is_discounted():
    world = build_world()
    q = world["people"][12]
    q.lifetime_matches = 60  # CS:GO veteran: old account, Elo carried over, few CS2 matches
    f = build_features("faction1", {"player_id": q.pid, "nickname": q.nick}, profile(q), lifetime(q), [], [])
    rk = risk.player_risk(f, [f], [])
    fast = [s for s in rk["signals"] if s["key"] == "fast_climb"]
    assert rk["classification"] is None
    assert not fast or fast[0]["strength"] < 0.5
