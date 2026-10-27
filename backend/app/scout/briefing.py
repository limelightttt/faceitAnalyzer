"""Pre-match briefing: every item is derived from computed evidence and typed as
fact (observed data), estimate (statistical computation) or hypothesis (interpretation)."""

from typing import Any

from ..tactical.profiles import MIN_DUELS

AREA_RU = {
    "A": "A",
    "B": "B",
    "Mid": "Mid",
    "CT spawn": "CT spawn",
    "T spawn": "T spawn",
    "other": "прочие зоны",
}


def build(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    us, them = ctx["us"], ctx["them"]  # faction keys ("faction1"/"faction2")
    teams, names = ctx["teams"], ctx["team_names"]
    cmp_ = ctx["comparison"]
    mp = ctx.get("map")

    def add(kind, category, text, evidence=None, confidence=None, refs=None):
        items.append(
            {
                "id": len(items) + 1,
                "kind": kind,
                "category": category,
                "text": text,
                "evidence": evidence or {},
                "confidence": confidence,
                "refs": refs or [],
            }
        )

    # 1. balance
    p = cmp_.get("elo_expectation")
    if p is not None:
        fav = names[us] if p > 0.5 else names[them]
        side_p = p if ctx["a_key"] == us else 1 - p
        ua, ta = teams[us]["summary"], teams[them]["summary"]
        diff = (ua["avg_elo"] or 0) - (ta["avg_elo"] or 0)
        txt = (
            f"Средний Elo: {names[us]} {ua['avg_elo']} против {ta['avg_elo']} у {names[them]} ({diff:+d}). "
            f"Elo-ожидание для {names[us]}: {side_p:.0%}"
            + ("" if abs(p - 0.5) >= 0.02 else " — практически равные составы")
        )
        if abs(p - 0.5) >= 0.02:
            txt += f", в пользу {fav}."
        counts = cmp_["factor_count"]
        a_is_us = ctx["a_key"] == us
        ours, theirs = (counts["a"], counts["b"]) if a_is_us else (counts["b"], counts["a"])
        if (side_p > 0.52 and theirs > ours) or (side_p < 0.48 and ours > theirs):
            txt += " При этом остальные факторы (форма, карта, опыт) распределены противоположно — преимущество неоднородно."
        add("estimate", "strength", txt, {"factors": cmp_["factors"], "model": cmp_["model"]}, "baseline")
    # 2. main threats on the opposing team
    threats = sorted(teams[them]["players"], key=lambda x: x["threat"]["rank"])
    if threats:
        t0 = threats[0]
        r = t0["recent"]
        parts = [
            f"Elo {t0['elo']}" if t0.get("elo") else None,
            f"Rating {r['rating']:.2f} за {r['n']} матчей" if r.get("rating") is not None else None,
            f"ADR {r['adr']:.0f}" if r.get("adr") is not None else None,
        ]
        mseg = t0.get("map_segment") or {}
        if mp and mseg.get("matches"):
            parts.append(
                f"на {mp} {int(mseg['matches'])} матчей, WR {mseg['win_rate']:.0%}"
                if mseg.get("win_rate") is not None
                else f"на {mp} {int(mseg['matches'])} матчей"
            )
        add(
            "fact",
            "threat",
            f"Главная угроза у {names[them]} — {t0['nickname']} (#{t0['threat']['rank']} в лобби по "
            f"композитному индексу): " + ", ".join(x for x in parts if x) + ".",
            {"player_id": t0["player_id"], "threat": t0["threat"]},
            None,
            [t0["player_id"]],
        )
    # 3. map experience
    if mp:
        a_map, b_map = teams[us]["summary"].get("map") or {}, teams[them]["summary"].get("map") or {}
        if a_map and b_map:
            txt = (
                f"Опыт на {mp}: у {names[us]} {a_map['total_matches']} матчей суммарно"
                + (f" (WR {a_map['win_rate']:.0%})" if a_map.get("win_rate") is not None else "")
                + f", у {names[them]} {b_map['total_matches']}"
                + (f" (WR {b_map['win_rate']:.0%})" if b_map.get("win_rate") is not None else "")
                + "."
            )
            if b_map.get("inexperienced"):
                txt += f" Мало опыта на карте у соперников: {', '.join(b_map['inexperienced'])}."
            add("fact", "map", txt, {"us": a_map, "them": b_map})
    else:
        pool = ctx.get("map_pool") or []
        if pool:
            top = [m for m in pool if m["them_matches"] > 0][:3]
            weak = [m for m in pool if m["them_matches"] >= 60 and m["them_win_rate"] is not None]
            weak.sort(key=lambda m: m["them_win_rate"])
            txt = (
                "Карта ещё не выбрана. Соперники чаще всего играют: "
                + ", ".join(f"{m['map']} ({m['them_matches']} м.)" for m in top)
                + "."
            )
            if weak:
                txt += f" Самый низкий WR при достаточном опыте — {weak[0]['map']} ({weak[0]['them_win_rate']:.0%})."
            add("fact", "map", txt, {"pool": pool})
    # 4. duos
    for pr in teams[them]["pairs"]:
        if pr["category"] in ("possible_duo", "established_cooperation"):
            txt = (
                f"{pr['a_name']} и {pr['b_name']}: {pr['shared_matches']} совместных матчей из последних "
                f"{pr['history_window']} ({pr['category_label'].lower()})"
            )
            if pr.get("win_rate_together") is not None and pr["together_n"] >= 5:
                txt += f", вместе WR {pr['win_rate_together']:.0%}"
            if pr["maps_together"]:
                txt += f"; чаще всего вместе на {pr['maps_together'][0][0]}"
            syn = pr.get("demo_evidence")
            if syn and syn.get("level") != "insufficient":
                if syn.get("colocation_places"):
                    txt += f". В демках часто вместе: {', '.join(p for p, _ in syn['colocation_places'][:2] if p)}"
                if syn.get("a_trades_b") or syn.get("b_trades_a"):
                    txt += f"; размены друг за друга: {syn['a_trades_b'] + syn['b_trades_a']}"
            add(
                "hypothesis",
                "duo",
                txt + ". Состав пати FACEIT не подтверждает.",
                {"pair": pr},
                "medium" if pr["category"] == "established_cooperation" else "low",
                [pr["a"], pr["b"]],
            )
    # 5. tactical
    tac = ctx.get("tactical") or {}
    them_tac = [pl for pl in teams[them]["players"] if (tac.get(pl["steam_id"] or "") or {}).get("observed")]
    if mp and them_tac:
        for pl in them_tac:
            prof = tac[pl["steam_id"]]["maps"].get(mp)
            if not prof:
                continue
            for side, sp in prof["sides"].items():
                pa = sp["primary_area"]
                if pa["level"] == "insufficient" or pa["area"] in ("other",):
                    continue
                places = ", ".join(x["place"] for x in sp["top_places"][:2])
                add(
                    "estimate",
                    "tactical",
                    f"{pl['nickname']} за {side} обычно начинает раунд в зоне {AREA_RU.get(pa['area'], pa['area'])} "
                    f"({pa['share']:.0%} из {sp['rounds']} раундов; чаще всего {places}). Уровень доказательности: "
                    f"{'предварительно' if pa['level'] == 'preliminary' else 'устойчивый паттерн'}.",
                    {"profile": sp, "demos": prof["demos"]},
                    pa["level"],
                    [pl["player_id"]],
                )
        site = ctx.get("site_duels", {}).get(them)
        if site:
            weakest = [s for s in site if s["n"] >= MIN_DUELS]
            if len(weakest) >= 2:
                weakest.sort(key=lambda s: s["win_rate"])
                w = weakest[0]
                add(
                    "estimate",
                    "tactical",
                    f"В разобранных демках соперники за CT слабее всего в зоне {w['area']}: выиграно {w['wins']} из {w['n']} "
                    f"дуэлей ({w['win_rate']:.0%}). Выборка небольшая.",
                    {"site_duels": site},
                    "preliminary",
                )
    elif mp:
        known = sum(1 for pl in teams[them]["players"] if pl.get("steam_id"))
        add(
            "fact",
            "tactical",
            f"Позиционных данных о соперниках на {mp} нет (0 из {known} игроков встречаются в "
            "разобранных демках). Тактические выводы о позициях не делаются — загрузите демки их прошлых матчей.",
            {"observed_players": 0},
        )
    # 6. risk
    for pl in teams[them]["players"] + teams[us]["players"]:
        rk = pl["risk"]
        if rk["classification"]:
            sig = "; ".join(s["detail"] for s in rk["signals"][:3])
            add(
                "hypothesis",
                "risk",
                f"{pl['nickname']}: {rk['label'].lower()} — {sig}. Проверьте детали: это "
                "статистическая необычность, а не доказательство.",
                {"risk": rk},
                rk["confidence"],
                [pl["player_id"]],
            )
    # 7. instability
    for key in (them, us):
        inst = teams[key]["instability"]
        if inst["level"] in ("moderate", "elevated"):
            add(
                "estimate",
                "stability",
                f"Стабильность состава {names[key]}: "
                f"{'повышенный риск' if inst['level'] == 'elevated' else 'умеренный риск'} — "
                + "; ".join(s["text"] for s in inst["signals"])
                + ".",
                {"instability": inst},
            )
    # 8. side-specific note grounded in tactical evidence only
    if mp and them_tac:
        mid_ct = [
            pl["nickname"]
            for pl in them_tac
            if (
                (tac[pl["steam_id"]]["maps"].get(mp) or {})
                .get("sides", {})
                .get("CT", {})
                .get("primary_area", {})
                .get("area")
                == "Mid"
                and tac[pl["steam_id"]]["maps"][mp]["sides"]["CT"]["primary_area"]["level"] != "insufficient"
            )
        ]
        if mid_ct:
            add(
                "hypothesis",
                "tactical",
                f"Если вы начинаете за T: по демкам Mid у соперников за CT держит {', '.join(mid_ct)} — "
                "ранний контакт в Mid вероятен.",
                {"players": mid_ct},
                "low",
            )
    return items
