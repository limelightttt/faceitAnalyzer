"""Cross-check our demo analytics against Awpy 3 (an independent Rust implementation).

Usage (Awpy is NOT a runtime dependency, install it into a throwaway env):
    uv venv /tmp/awpy-env && uv pip install --python /tmp/awpy-env awpy demoparser2==0.42.0 pandas numpy zstandard
    /tmp/awpy-env/bin/python scripts/validate_against_awpy.py path/to/demo.dem
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from awpy import Demo  # noqa: E402

from app.demo.analysis import analyze_demo  # noqa: E402
from app.demo.parser import parse_demo  # noqa: E402


def main(path: str) -> None:
    ours = {p["steamid"]: p for p in analyze_demo(parse_demo(Path(path)), Path(path).name)["players"]}
    theirs = Demo(path).stats.to_dicts()
    cols = [("kills", "kills"), ("deaths", "deaths"), ("assists", "assists"), ("adr", "adr"), ("kast", "kast"),
            ("rounds", "rounds_played"), ("opening_kills", "opening_kills"), ("traded_deaths", "traded_deaths"),
            ("flashes", "flashes_thrown"), ("enemies_flashed", "enemies_flashed"), ("utility_damage", "utility_damage"),
            ("clutch_attempts", "clutches_played")]
    print(f"{'player':<20}" + "".join(f"{c[:15]:>16}" for c, _ in cols))
    for row in theirs:
        sid = str(row.get("steamid"))
        o = ours.get(sid)
        if not o:
            continue
        cells = []
        for ours_key, awpy_key in cols:
            a, b = o[ours_key], row.get(awpy_key)
            b = round(b, 1) if isinstance(b, float) else b
            cells.append(f"{a!s:>7} / {b!s:<7}")
        print(f"{o['name'][:19]:<20}" + "".join(cells))
    print("\n(ours / awpy)")


if __name__ == "__main__":
    main(sys.argv[1])
