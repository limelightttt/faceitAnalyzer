"""Map geometry helpers.

* Places are CS2 nav-mesh callouts recorded by the game (`last_place_name`) — facts from the demo.
* Macro areas (A / B / Mid / spawns) group callouts. The grouping is a best-effort curation for the
  active-duty maps; unknown callouts stay ungrouped ("other") instead of being guessed.
* Radar transforms come from awpy-data (MIT), see map_data.json.
"""

import json
from functools import lru_cache
from pathlib import Path

_MACRO: dict[str, dict[str, list[str]]] = {
    "de_mirage": {
        "A": [
            "BombsiteA",
            "PalaceInterior",
            "PalaceAlley",
            "TRamp",
            "Scaffolding",
            "Stairs",
            "Jungle",
            "Truck",
            "TicketBooth",
            "Firebox",
            "Tetris",
        ],
        "B": ["BombsiteB", "Apartments", "BackAlley", "Shop", "Market", "Kitchen", "Bench", "Van"],
        "Mid": [
            "Middle",
            "TopofMid",
            "Connector",
            "Catwalk",
            "Underpass",
            "SnipersNest",
            "Ladder",
            "House",
            "SideAlley",
            "Window",
        ],
    },
    "de_dust2": {
        "A": [
            "BombsiteA",
            "LongA",
            "LongDoors",
            "ARamp",
            "Pit",
            "Catwalk",
            "ShortStairs",
            "ExtendedA",
            "Side",
            "OutsideLong",
            "BlueBox",
        ],
        "B": [
            "BombsiteB",
            "BDoors",
            "UpperTunnel",
            "LowerTunnel",
            "Tunnels",
            "BPlatform",
            "Fence",
            "BackofB",
        ],
        "Mid": ["Middle", "MidDoors", "TopofMid", "Xbox"],
    },
    "de_inferno": {
        "A": [
            "BombsiteA",
            "Pit",
            "Graveyard",
            "Quad",
            "Balcony",
            "Arch",
            "Library",
            "Apartments",
            "Boiler",
            "TopofApartments",
            "Short",
            "Long",
            "ArchSide",
        ],
        "B": [
            "BombsiteB",
            "Banana",
            "Ruins",
            "Construction",
            "Coffins",
            "Dark",
            "NewBox",
            "CTSpawn_B",
            "TopofBanana",
            "BottomofBanana",
            "Fountain",
        ],
        "Mid": ["Middle", "TopofMid", "SecondMid", "Bridge", "Alley", "Underpass"],
    },
    "de_ancient": {
        "A": ["BombsiteA", "TempleA", "MainA", "Donut", "AHouse"],
        "B": ["BombsiteB", "BRamp", "Cave", "BHouse", "Water"],
        "Mid": ["Middle", "TopofMid", "Elbow", "MidHouse"],
    },
    "de_anubis": {
        "A": ["BombsiteA", "AMain", "Heaven", "Walkway"],
        "B": ["BombsiteB", "BMain", "Palace", "Canal", "Water"],
        "Mid": ["Middle", "TopofMid", "Bridge", "Connector"],
    },
}
_SPAWNS = {"CTSpawn": "CT spawn", "TSpawn": "T spawn"}


def macro_area(map_name: str, place: str | None) -> str:
    if not place:
        return "other"
    if place in _SPAWNS:
        return _SPAWNS[place]
    for area, places in _MACRO.get(map_name, {}).items():
        if place in places:
            return area
    if place.startswith("BombsiteA"):
        return "A"
    if place.startswith("BombsiteB"):
        return "B"
    if place in ("Middle", "TopofMid", "MidDoors"):
        return "Mid"
    return "other"


def has_curated_areas(map_name: str) -> bool:
    return map_name in _MACRO


@lru_cache
def radar_transforms() -> dict[str, dict[str, float]]:
    return json.loads((Path(__file__).parent / "map_data.json").read_text("utf-8"))["maps"]


def to_radar(map_name: str, x: float, y: float) -> tuple[float, float] | None:
    t = radar_transforms().get(map_name)
    if not t:
        return None
    return ((x - t["pos_x"]) / t["scale"], (t["pos_y"] - y) / t["scale"])
