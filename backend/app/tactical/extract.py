"""Turn one parsed demo into tactical observations (positions per round phase, duel locations, trades).

Output is stored in the demo analysis (`analysis["tactical"]`) and ingested into `tactical_samples`.
Nothing here is inferred: every sample is a recorded position/event from the demo.
"""

from collections import defaultdict
from typing import Any

from .zones import macro_area, to_radar


def extract_tactical(nd, rounds: list[dict[str, Any]], team_of: dict[str, str]) -> dict[str, Any]:
    map_name = str(nd.header.get("map_name") or "")
    samples: list[dict[str, Any]] = []

    by_tick: dict[int, list[dict]] = defaultdict(list)
    for p in nd.positions:
        by_tick[p["tick"]].append(p)
    for group in by_tick.values():
        for p in group:
            area = macro_area(map_name, p["place"])
            mates = [
                o["steamid"]
                for o in group
                if o is not p
                and team_of.get(o["steamid"]) == team_of.get(p["steamid"])
                and macro_area(map_name, o["place"]) == area
                and area != "other"
            ]
            samples.append(
                _sample(
                    map_name,
                    p["steamid"],
                    p["round"],
                    p["side"],
                    "position",
                    p["phase"],
                    p["place"],
                    p["x"],
                    p["y"],
                    mates,
                )
            )

    trades: list[dict[str, Any]] = []
    for r in rounds:
        sides = r["sides"]
        for k in r["kills"]:
            if k["team_kill"] or not k["attacker"] or k["attacker"] == k["victim"]:
                continue
            t = k["time"]
            phase = "early" if t < 20 else "mid" if t < 45 else "late"
            a_side = sides.get(team_of.get(k["attacker"], ""), "?")
            v_side = sides.get(team_of.get(k["victim"], ""), "?")
            ax, ay = k.get("attacker_pos") or [0, 0]
            vx, vy = k.get("victim_pos") or [0, 0]
            kind_w, kind_l = ("opening_win", "opening_loss") if k["opening"] else ("duel_win", "duel_loss")
            samples.append(
                _sample(
                    map_name,
                    k["attacker"],
                    r["number"],
                    a_side,
                    kind_w,
                    phase,
                    k.get("attacker_place"),
                    ax,
                    ay,
                    None,
                )
            )
            samples.append(
                _sample(
                    map_name,
                    k["victim"],
                    r["number"],
                    v_side,
                    kind_l,
                    phase,
                    k.get("victim_place"),
                    vx,
                    vy,
                    None,
                )
            )
            if k.get("trade_for"):
                trades.append(
                    {
                        "round": r["number"],
                        "trader": k["attacker"],
                        "traded": k["trade_for"],
                        "place": k.get("attacker_place"),
                    }
                )
    return {"map": map_name, "samples": samples, "trades": trades, "players": list(team_of)}


def _sample(map_name, sid, rnd, side, kind, phase, place, x, y, mates) -> dict[str, Any]:
    radar = to_radar(map_name, x, y)
    return {
        "steam_id": sid,
        "round": rnd,
        "side": side,
        "kind": kind,
        "phase": phase,
        "place": place,
        "area": macro_area(map_name, place),
        "x": x,
        "y": y,
        "rx": round(radar[0], 1) if radar else None,
        "ry": round(radar[1], 1) if radar else None,
        "teammates": mates,
    }
