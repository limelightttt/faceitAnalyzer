"""Normalized demo events -> match analytics (scoreboard, rounds, KAST, openings, trades, clutches,
utility, economy) + highlights + per-player insights."""

from collections import Counter, defaultdict
from typing import Any

from .highlights import find_highlights
from .parser import NormalizedDemo

TRADE_WINDOW_S = 5.0
ENEMY_FLASH_MIN_S = 0.7
UTILITY_WEAPONS = {"hegrenade", "inferno", "molotov", "incgrenade"}
REASONS = {
    1: "Бомба взорвана",
    7: "Бомба обезврежена",
    8: "CT уничтожили T",
    9: "T уничтожили CT",
    10: "Ничья",
    12: "Время вышло",
    17: "T сдались",
    18: "CT сдались",
}

_AVG_KPR, _AVG_SPR, _AVG_RMK = 0.679, 0.317, 1.277


def _buy_type(avg: float, pistol: bool) -> str:
    if pistol:
        return "pistol"
    if avg >= 3900:
        return "full"
    if avg >= 2000:
        return "force"
    return "eco"


def _teams(nd: NormalizedDemo) -> tuple[dict[str, str], dict[int, dict[str, str]]]:
    """Stable team identity (A/B) across side switches; returns player->team and round->team->side."""
    team_of: dict[str, str] = {}
    for rn in sorted(nd.sides):
        sides = nd.sides[rn]
        known = defaultdict(Counter)
        for sid, side in sides.items():
            if sid in team_of:
                known[team_of[sid]][side] += 1
        if not team_of:
            for sid, side in sides.items():
                team_of[sid] = "A" if side == "T" else "B"
            continue
        side_a = (
            known["A"].most_common(1)[0][0]
            if known["A"]
            else ("CT" if known["B"] and known["B"].most_common(1)[0][0] == "T" else "T")
        )
        for sid, side in sides.items():
            team_of.setdefault(sid, "A" if side == side_a else "B")
    round_sides: dict[int, dict[str, str]] = {}
    for rn, sides in nd.sides.items():
        a = Counter(side for sid, side in sides.items() if team_of.get(sid) == "A")
        side_a = a.most_common(1)[0][0] if a else "T"
        round_sides[rn] = {"A": side_a, "B": "CT" if side_a == "T" else "T"}
    return team_of, round_sides


def analyze_demo(nd: NormalizedDemo, file_name: str) -> dict[str, Any]:
    tr = nd.tickrate
    team_of, round_sides = _teams(nd)
    trade_ticks = int(TRADE_WINDOW_S * tr)

    st: dict[str, dict[str, Any]] = {
        sid: {
            "steamid": sid,
            "name": name,
            "team": team_of.get(sid, "?"),
            "rounds": 0,
            "kills": 0,
            "deaths": 0,
            "assists": 0,
            "flash_assists": 0,
            "headshots": 0,
            "damage": 0,
            "utility_damage": 0,
            "kast_rounds": 0,
            "opening_kills": 0,
            "opening_deaths": 0,
            "trade_kills": 0,
            "traded_deaths": 0,
            "team_kills": 0,
            "multi": {"2": 0, "3": 0, "4": 0, "5": 0},
            "clutch_attempts": 0,
            "clutch_wins": 0,
            "clutches": [],
            "flashes": 0,
            "smokes": 0,
            "he": 0,
            "molotovs": 0,
            "enemies_flashed": 0,
            "enemy_blind_time": 0.0,
            "team_flashed": 0,
            "awp_kills": 0,
            "rmk_points": 0,
            "survived": 0,
        }
        for sid, name in nd.players.items()
    }

    kills_by_round: dict[int, list[dict]] = defaultdict(list)
    for k in nd.kills:
        kills_by_round[k["round"]].append(k)
    dmg_by_round: dict[int, list[dict]] = defaultdict(list)
    for d in nd.damages:
        dmg_by_round[d["round"]].append(d)

    score = {"A": 0, "B": 0}
    rounds_out: list[dict[str, Any]] = []
    half_rounds = {1, 13}  # MR12 pistol rounds
    for r in nd.rounds:
        rn = r.number
        sides = nd.sides.get(rn, {})
        present = set(sides)
        rs = round_sides.get(rn, {"A": "T", "B": "CT"})
        winner_team = "A" if rs["A"] == r.winner_side else "B"
        score[winner_team] += 1
        rkills = kills_by_round.get(rn, [])
        t0 = r.freeze_end_tick

        died, killed, assisted, traded = set(), Counter(), set(), set()
        enriched = []
        first_kill_done = False
        alive = {
            "A": {s for s in present if team_of.get(s) == "A"},
            "B": {s for s in present if team_of.get(s) == "B"},
        }
        clutch_started: dict[str, dict[str, Any]] = {}
        for k in rkills:
            a, v = k["attacker"], k["victim"]
            vt, at = team_of.get(v), team_of.get(a) if a else None
            team_kill = a is not None and at == vt and a != v
            suicide = a is None or a == v
            e = dict(
                k,
                time=round((k["tick"] - t0) / tr, 1),
                attacker_team=at,
                victim_team=vt,
                team_kill=team_kill,
                opening=False,
                trade=False,
                traded=False,
            )
            if v in st:
                st[v]["deaths"] += 1
            died.add(v)
            if not team_kill and not suicide and a in st:
                st[a]["kills"] += 1
                killed[a] += 1
                st[a]["headshots"] += int(k["headshot"])
                if k["weapon"] in ("awp", "ssg08"):
                    st[a]["awp_kills"] += 1
                if not first_kill_done:
                    e["opening"] = True
                    st[a]["opening_kills"] += 1
                    if v in st:
                        st[v]["opening_deaths"] += 1
                # trade: attacker kills the player who killed a teammate within the window
                for prev in reversed(enriched):
                    if k["tick"] - prev["tick"] > trade_ticks:
                        break
                    if prev["attacker"] == v and prev["victim_team"] == at and not prev["traded"]:
                        prev["traded"] = True
                        e["trade"] = True
                        st[a]["trade_kills"] += 1
                        traded.add(prev["victim"])
                        if prev["victim"] in st:
                            st[prev["victim"]]["traded_deaths"] += 1
                        break
                first_kill_done = True
            elif team_kill and a in st:
                st[a]["team_kills"] += 1
            asst = k["assister"]
            if asst and asst in st and team_of.get(asst) != vt:
                st[asst]["assists"] += 1
                assisted.add(asst)
                if k["flash_assist"]:
                    st[asst]["flash_assists"] += 1
            enriched.append(e)
            # clutch detection: a side reduced to one player against >= 1 enemy
            if vt in alive:
                alive[vt].discard(v)
                for team in ("A", "B"):
                    other = "B" if team == "A" else "A"
                    if len(alive[team]) == 1 and alive[other] and team not in clutch_started:
                        pl = next(iter(alive[team]))
                        clutch_started[team] = {
                            "player": pl,
                            "vs": len(alive[other]),
                            "tick": k["tick"],
                            "kills_before": killed[pl],
                        }

        clutch = None
        for team, c in clutch_started.items():
            if c["player"] not in st:
                continue
            won = winner_team == team
            c_out = {
                "player": c["player"],
                "name": st[c["player"]]["name"],
                "team": team,
                "vs": c["vs"],
                "won": won,
                "kills": killed[c["player"]] - c["kills_before"],
                "time": round((c["tick"] - t0) / tr, 1),
            }
            st[c["player"]]["clutch_attempts"] += 1
            st[c["player"]]["clutch_wins"] += int(won)
            st[c["player"]]["clutches"].append(dict(c_out, round=rn))
            if clutch is None or won:
                clutch = c_out

        # damage with health tracking (dmg_health can exceed remaining HP)
        hp: dict[str, int] = defaultdict(lambda: 100)
        round_dmg: Counter = Counter()
        for d in dmg_by_round.get(rn, []):
            v, a = d["victim"], d["attacker"]
            actual = max(0, min(d["dmg_health"], hp[v] - d["health_after"]))
            hp[v] = d["health_after"]
            if a and a in st and a != v and team_of.get(a) != team_of.get(v):
                st[a]["damage"] += actual
                round_dmg[a] += actual
                if d["weapon"] in UTILITY_WEAPONS:
                    st[a]["utility_damage"] += actual

        for sid in present:
            if sid not in st:
                continue
            s = st[sid]
            s["rounds"] += 1
            survived = sid not in died
            s["survived"] += int(survived)
            if killed[sid] or sid in assisted or survived or sid in traded:
                s["kast_rounds"] += 1
            kc = killed[sid]
            s["rmk_points"] += kc * kc
            if kc >= 2:
                s["multi"][str(min(kc, 5))] += 1

        eq = nd.equip.get(rn, {}) if r.freeze_end_tick > r.start_tick or rn == 1 else {}
        econ = {}
        for team in ("A", "B"):
            vals = [eq[s] for s in present if team_of.get(s) == team and s in eq]
            avg = sum(vals) / len(vals) if vals else 0
            econ[team] = {"equipment": sum(vals), "buy": _buy_type(avg, rn in half_rounds) if vals else None}
        bomb = [b for b in nd.bomb if b["round"] == rn]
        rounds_out.append(
            {
                "number": rn,
                "winner_team": winner_team,
                "winner_side": r.winner_side,
                "reason": r.reason,
                "reason_text": REASONS.get(r.reason, str(r.reason)),
                "sides": rs,
                "score_after": dict(score),
                "freeze_end_tick": r.freeze_end_tick,
                "end_tick": r.end_tick,
                "duration": round((r.end_tick - r.freeze_end_tick) / tr, 1),
                "kills": enriched,
                "economy": econ,
                "bomb": [
                    {
                        "event": b["event"],
                        "time": round((b["tick"] - t0) / tr, 1),
                        "place": b["place"],
                        "player": nd.players.get(b["player"] or "", None),
                    }
                    for b in bomb
                ],
                "clutch": clutch,
                "top_damage": [{"steamid": s, "damage": d} for s, d in round_dmg.most_common(3)],
            }
        )

    for b in nd.blinds:
        a, v = b["attacker"], b["victim"]
        if not a or a not in st or not v or a == v:
            continue
        if team_of.get(a) != team_of.get(v):
            if b["duration"] >= ENEMY_FLASH_MIN_S:
                st[a]["enemies_flashed"] += 1
            st[a]["enemy_blind_time"] += b["duration"]
        elif b["duration"] >= ENEMY_FLASH_MIN_S:
            st[a]["team_flashed"] += 1
    for g in nd.grenades:
        t = g["thrower"]
        if t in st:
            st[t][{"flash": "flashes", "smoke": "smokes", "he": "he", "molotov": "molotovs"}[g["type"]]] += 1

    players_out = []
    for s in st.values():
        n = s["rounds"]
        if n == 0:
            continue
        kpr, spr = s["kills"] / n, s["survived"] / n
        rating = (kpr / _AVG_KPR + 0.7 * spr / _AVG_SPR + s["rmk_points"] / n / _AVG_RMK) / 2.7
        s.update(
            adr=round(s["damage"] / n, 1),
            kast=round(100 * s["kast_rounds"] / n, 1),
            hs_pct=round(100 * s["headshots"] / s["kills"], 1) if s["kills"] else 0.0,
            rating=round(rating, 2),
            kpr=round(kpr, 2),
            enemy_blind_time=round(s["enemy_blind_time"], 1),
            kd=round(s["kills"] / max(s["deaths"], 1), 2),
        )
        del s["rmk_points"]
        players_out.append(s)
    players_out.sort(key=lambda s: (s["team"], -s["rating"]))

    teams_out = []
    for team in ("A", "B"):
        members = [p for p in players_out if p["team"] == team]
        first_side = round_sides.get(nd.rounds[0].number, {}).get(team) if nd.rounds else None
        lead = max(members, key=lambda p: p["rating"])["name"] if members else team
        teams_out.append(
            {
                "id": team,
                "name": f"Команда {lead}",
                "score": score[team],
                "start_side": first_side,
                "players": [p["steamid"] for p in members],
            }
        )

    highlights = find_highlights(rounds_out, players_out, nd, tr)
    by_round: dict[int, list[str]] = defaultdict(list)
    for h in highlights:
        by_round[h["round"]].append(h["id"])
    for r in rounds_out:
        r["highlights"] = by_round.get(r["number"], [])

    duration = (nd.rounds[-1].end_tick - nd.match_start_tick) / tr if nd.rounds else 0
    return {
        "file_name": file_name,
        "map": nd.header.get("map_name"),
        "server": nd.header.get("server_name"),
        "client": nd.header.get("client_name"),
        "parser": f"demoparser2 {nd.parser_version}",
        "tickrate": tr,
        "duration_s": round(duration),
        "rounds_played": len(nd.rounds),
        "teams": teams_out,
        "players": players_out,
        "rounds": rounds_out,
        "highlights": highlights,
        "insights": {p["steamid"]: player_insights(p, players_out) for p in players_out},
        "definitions": {
            "kast": "Доля раундов с убийством, ассистом, выживанием или разменянной смертью",
            "trade": f"Убийство врага, убившего тиммейта, в пределах {TRADE_WINDOW_S:.0f} с",
            "opening": "Первое убийство раунда",
            "enemies_flashed": f"Враги, ослеплённые ≥ {ENEMY_FLASH_MIN_S} с",
            "rating": "HLTV Rating 1.0 по фактическим убийствам в каждом раунде",
            "adr": "Фактический урон по здоровью врагов (с учётом остатка HP) / раунды",
        },
    }


def player_insights(p: dict[str, Any], players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    others = [o for o in players if o["steamid"] != p["steamid"]]
    if not others:
        return []

    def lobby(key):
        return sum(o[key] for o in others) / len(others)

    out: list[dict[str, Any]] = []

    def add(kind, title, detail, metric, value, ref):
        out.append(
            {
                "kind": kind,
                "title": title,
                "detail": detail,
                "metric": metric,
                "value": round(value, 2),
                "lobby": round(ref, 2),
            }
        )

    n = p["rounds"]
    for key, label, fmt in (
        ("adr", "ADR", "{:.0f}"),
        ("kast", "KAST", "{:.0f}%"),
        ("rating", "Rating", "{:.2f}"),
    ):
        ref = lobby(key)
        if ref and p[key] >= ref * 1.2:
            add(
                "strength",
                f"Высокий {label}",
                f"{fmt.format(p[key])} против {fmt.format(ref)} в среднем по лобби.",
                key,
                p[key],
                ref,
            )
        elif ref and p[key] <= ref * 0.8:
            add(
                "weakness",
                f"Низкий {label}",
                f"{fmt.format(p[key])} против {fmt.format(ref)} в среднем по лобби.",
                key,
                p[key],
                ref,
            )
    duels = p["opening_kills"] + p["opening_deaths"]
    if duels >= 3:
        rate = p["opening_kills"] / duels
        if rate >= 0.6:
            add(
                "strength",
                "Выигрывает первые дуэли",
                f"{p['opening_kills']} из {duels} opening-дуэлей выиграны.",
                "opening_rate",
                rate,
                0.5,
            )
        elif rate <= 0.35:
            add(
                "weakness",
                "Проигрывает первые дуэли",
                f"{p['opening_deaths']} из {duels} opening-дуэлей проиграны: команда часто начинает раунд 4v5.",
                "opening_rate",
                rate,
                0.5,
            )
    if p["deaths"] >= 5:
        tr_rate = p["traded_deaths"] / p["deaths"]
        ref = sum(o["traded_deaths"] for o in others) / max(1, sum(o["deaths"] for o in others))
        if tr_rate <= ref - 0.15:
            add(
                "weakness",
                "Смерти без размена",
                f"Разменяно только {tr_rate:.0%} смертей (лобби {ref:.0%}) — позиции слишком далеко от команды.",
                "traded_death_rate",
                tr_rate,
                ref,
            )
        elif tr_rate >= ref + 0.15:
            add(
                "strength",
                "Смерти в зоне размена",
                f"Разменяно {tr_rate:.0%} смертей (лобби {ref:.0%}).",
                "traded_death_rate",
                tr_rate,
                ref,
            )
    if p["trade_kills"] >= 3 and p["trade_kills"] >= lobby("trade_kills") * 1.5:
        add(
            "strength",
            "Разменивает тиммейтов",
            f"{p['trade_kills']} трейд-киллов (лобби {lobby('trade_kills'):.1f}).",
            "trade_kills",
            p["trade_kills"],
            lobby("trade_kills"),
        )
    nades = (p["flashes"] + p["smokes"] + p["he"] + p["molotovs"]) / n
    ref_n = sum(
        (o["flashes"] + o["smokes"] + o["he"] + o["molotovs"]) / max(o["rounds"], 1) for o in others
    ) / len(others)
    if nades <= ref_n * 0.6:
        add(
            "weakness",
            "Мало утилиты",
            f"{nades:.1f} гранаты за раунд против {ref_n:.1f} у лобби.",
            "utility_per_round",
            nades,
            ref_n,
        )
    elif nades >= ref_n * 1.4:
        add(
            "strength",
            "Активно использует утилиту",
            f"{nades:.1f} гранаты за раунд против {ref_n:.1f}.",
            "utility_per_round",
            nades,
            ref_n,
        )
    if p["flashes"] >= 4:
        eff = p["enemies_flashed"] / p["flashes"]
        if p["team_flashed"] > p["enemies_flashed"]:
            add(
                "weakness",
                "Флешки слепят своих",
                f"Своих ослеплено {p['team_flashed']}, врагов {p['enemies_flashed']} из {p['flashes']} флешек.",
                "flash_efficiency",
                eff,
                0,
            )
        elif eff >= 1.0:
            add(
                "strength",
                "Эффективные флешки",
                f"{eff:.1f} ослеплённых врагов на флешку.",
                "flash_efficiency",
                eff,
                0,
            )
    if p["clutch_attempts"]:
        add(
            "info",
            "Клатчи",
            f"Выиграно {p['clutch_wins']} из {p['clutch_attempts']} ситуаций 1vN.",
            "clutch",
            p["clutch_wins"],
            p["clutch_attempts"],
        )
    if p["kast"] >= 70 and p["adr"] < lobby("adr") * 0.85:
        add(
            "info",
            "Выживает, но мало влияет",
            "Высокий KAST при низком уроне: возможно, пассивная роль/поздние ротации.",
            "kast",
            p["kast"],
            lobby("kast"),
        )
    if n < 16:
        for i in out:
            i["detail"] += " (короткий матч — вывод ориентировочный)"
    return out
