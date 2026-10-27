"""Highlight candidates: scored moments with round, in-round time and a tick to jump to in CS2
(`demo_gototick <tick>` in the console while watching the demo).

Score (0-100, transparent): multi-kill base {2:15, 3:35, 4:60, 5:85}; won clutch +20 +10 per extra
enemy; fast spree (all kills within 6 s) +10; special kills (+8 noscope/blind, +6 wallbang/through smoke,
+12 knife, +6 zeus); context +5 for pistol rounds and rounds at match/half point; capped at 100.
"""

from collections import defaultdict
from typing import Any

MULTI_BASE = {1: 0, 2: 15, 3: 35, 4: 60, 5: 85}
PRE_ROLL_S, POST_ROLL_S = 5.0, 3.0
MIN_SCORE = 30


def find_highlights(rounds: list[dict], players: list[dict], nd, tickrate: float) -> list[dict[str, Any]]:
    names = {p["steamid"]: p["name"] for p in players}
    team_of = {p["steamid"]: p["team"] for p in players}
    total = len(rounds)
    out = []
    for r in rounds:
        per_player: dict[str, list[dict]] = defaultdict(list)
        for k in r["kills"]:
            if k["attacker"] and not k["team_kill"] and k["attacker"] != k["victim"]:
                per_player[k["attacker"]].append(k)
        clutch = r.get("clutch")
        for sid, ks in per_player.items():
            n = min(len(ks), 5)
            score = MULTI_BASE[n]
            tags = []
            if n >= 2:
                tags.append({2: "2K", 3: "3K", 4: "4K", 5: "ACE"}[n])
            span = (ks[-1]["tick"] - ks[0]["tick"]) / tickrate
            if n >= 2 and span <= 6:
                score += 10
                tags.append(f"за {span:.1f} с")
            c = clutch if clutch and clutch["player"] == sid else None
            if c and c["won"]:
                score += 20 + 10 * (c["vs"] - 1)
                tags.append(f"клатч 1v{c['vs']}")
            for k in ks:
                if k["noscope"]:
                    score += 8
                    tags.append("noscope")
                if k["attacker_blind"]:
                    score += 8
                    tags.append("ослеплённым")
                if k["wallbang"]:
                    score += 6
                    tags.append("прострел")
                if k["thrusmoke"]:
                    score += 6
                    tags.append("через смок")
                if k["weapon"].startswith("knife") or k["weapon"] == "bayonet":
                    score += 12
                    tags.append("нож")
                if k["weapon"] == "taser":
                    score += 6
                    tags.append("zeus")
            if r["number"] in (1, 13):
                score += 5
                tags.append("пистолетный")
            if r["number"] == total or r["number"] == 12:
                score += 5
                tags.append("ключевой раунд")
            score = min(score, 100)
            if score < MIN_SCORE and not (c and c["won"]):
                continue
            hs = sum(1 for k in ks if k["headshot"])
            weapons = sorted({k["weapon"] for k in ks})
            start_tick = max(int(ks[0]["tick"] - PRE_ROLL_S * tickrate), r["freeze_end_tick"])
            title = (
                f"Клатч 1v{c['vs']}"
                if c and c["won"]
                else {2: "Дабл", 3: "Трипл", 4: "Квадро", 5: "Эйс"}.get(n, "Момент")
            )
            out.append(
                {
                    "id": f"r{r['number']}-{sid}",
                    "round": r["number"],
                    "steamid": sid,
                    "player": names.get(sid, sid),
                    "team": team_of.get(sid),
                    "score": score,
                    "title": title,
                    "kills": len(ks),
                    "headshots": hs,
                    "weapons": weapons,
                    "tags": list(dict.fromkeys(tags)),
                    "round_time": ks[0]["time"],
                    "start_tick": start_tick,
                    "end_tick": int(ks[-1]["tick"] + POST_ROLL_S * tickrate),
                    "start_time_s": round(start_tick / tickrate, 1),
                    "goto_cmd": f"demo_gototick {start_tick}",
                    "round_won": r["winner_team"] == team_of.get(sid),
                    "victims": [names.get(k["victim"], k["victim"]) for k in ks],
                }
            )
    out.sort(key=lambda h: -h["score"])
    return out
