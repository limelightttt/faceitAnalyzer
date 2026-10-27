from app.db import Database
from app.tactical.profiles import ingest, pair_synergy, player_profiles
from app.tactical.zones import macro_area, to_radar


def _tac(n_rounds, place="Middle", sid="s1", mate="s2"):
    samples = []
    for r in range(1, n_rounds + 1):
        samples.append(
            {
                "steam_id": sid,
                "round": r,
                "side": "CT",
                "kind": "position",
                "phase": "early",
                "place": place,
                "x": 0,
                "y": 0,
                "teammates": [mate],
            }
        )
        samples.append(
            {
                "steam_id": mate,
                "round": r,
                "side": "CT",
                "kind": "position",
                "phase": "early",
                "place": place,
                "x": 0,
                "y": 0,
                "teammates": [sid],
            }
        )
    return {
        "map": "de_mirage",
        "samples": samples,
        "trades": [{"round": 1, "trader": mate, "traded": sid, "place": place}],
    }


def test_evidence_levels(tmp_path):
    db = Database(f"sqlite:///{tmp_path}/t.db")
    with db.session() as s:
        ingest(s, "d1", _tac(3))
        p = player_profiles(s, ["s1", "nobody"], "de_mirage")
        assert p["nobody"]["observed"] is False
        assert p["s1"]["maps"]["de_mirage"]["sides"]["CT"]["primary_area"]["level"] == "insufficient"
        ingest(s, "d2", _tac(12))
        lvl = player_profiles(s, ["s1"], "de_mirage")["s1"]["maps"]["de_mirage"]["sides"]["CT"][
            "primary_area"
        ]
        assert lvl["area"] == "Mid" and lvl["level"] == "preliminary"
        ingest(s, "d3", _tac(12))
        lvl = player_profiles(s, ["s1"], "de_mirage")["s1"]["maps"]["de_mirage"]["sides"]["CT"][
            "primary_area"
        ]
        assert lvl["level"] == "pattern"
        syn = pair_synergy(s, "s1", "s2", "de_mirage")
        assert syn["colocation_rate"] == 1.0 and syn["b_trades_a"] == 3


def test_reingest_replaces_and_mixed_areas_stay_insufficient(tmp_path):
    db = Database(f"sqlite:///{tmp_path}/t.db")
    with db.session() as s:
        mixed = {
            "map": "de_mirage",
            "trades": [],
            "samples": [
                {
                    "steam_id": "s1",
                    "round": r,
                    "side": "T",
                    "kind": "position",
                    "phase": "early",
                    "place": ["BombsiteA", "BombsiteB", "Middle"][r % 3],
                    "x": 0,
                    "y": 0,
                    "teammates": [],
                }
                for r in range(12)
            ],
        }
        ingest(s, "d1", mixed)
        ingest(s, "d1", mixed)  # idempotent per demo
        prof = player_profiles(s, ["s1"])["s1"]["maps"]["de_mirage"]["sides"]["T"]
        assert prof["rounds"] == 12 and prof["primary_area"]["level"] == "insufficient"


def test_zone_mapping_and_radar_transform():
    assert macro_area("de_mirage", "PalaceInterior") == "A"
    assert macro_area("de_mirage", "Apartments") == "B"
    assert macro_area("de_unknownmap", "SomethingNew") == "other"
    x, y = to_radar("de_mirage", -3230, 1713)  # radar origin from map_data.json
    assert abs(x) < 1 and abs(y) < 1
