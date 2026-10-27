"""Raw FACEIT Data API v4 payloads -> domain models. Shared by live API and fixture providers."""

from datetime import UTC, datetime
from typing import Any

from .analytics.rating import hltv_rating_1
from .domain import Match, PlayerMatchStats, PlayerProfile, RosterPlayer, TeamInfo


def _num(v: Any, default: float | None = 0.0) -> float | None:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _int(v: Any, default: int | None = 0) -> int | None:
    f = _num(v, None)
    return default if f is None else int(round(f))


def _ts(v: Any) -> datetime | None:
    if v in (None, "", 0):
        return None
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v, tz=UTC)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_profile(raw: dict[str, Any]) -> PlayerProfile:
    cs2 = (raw.get("games") or {}).get("cs2") or {}
    return PlayerProfile(
        player_id=raw["player_id"],
        nickname=raw["nickname"],
        avatar=raw.get("avatar") or None,
        country=raw.get("country"),
        region=cs2.get("region"),
        elo=_int(cs2.get("faceit_elo"), None),
        skill_level=_int(cs2.get("skill_level"), None),
        steam_id=cs2.get("game_player_id") or raw.get("steam_id_64"),
        faceit_url=(raw.get("faceit_url") or "").replace("{lang}", "en") or None,
    )


def normalize_player_stats(p: dict[str, Any], rounds: int) -> PlayerMatchStats:
    s = p.get("player_stats") or {}
    opt = lambda key: _int(s.get(key), None)  # noqa: E731 - fields absent in older payloads stay None
    stats = PlayerMatchStats(
        player_id=p["player_id"],
        nickname=p.get("nickname", "?"),
        kills=_int(s.get("Kills")),
        deaths=_int(s.get("Deaths")),
        assists=_int(s.get("Assists")),
        headshots=_int(s.get("Headshots")),
        hs_pct=_num(s.get("Headshots %")),
        mvps=_int(s.get("MVPs")),
        adr=_num(s.get("ADR"), None),
        damage=opt("Damage"),
        kr=_num(s.get("K/R Ratio")),
        kd=_num(s.get("K/D Ratio")),
        double_kills=_int(s.get("Double Kills")),
        triple_kills=_int(s.get("Triple Kills")),
        quadro_kills=_int(s.get("Quadro Kills")),
        penta_kills=_int(s.get("Penta Kills")),
        entry_count=opt("Entry Count"),
        entry_wins=opt("Entry Wins"),
        first_kills=opt("First Kills"),
        clutch_1v1_count=opt("1v1Count"),
        clutch_1v1_wins=opt("1v1Wins"),
        clutch_1v2_count=opt("1v2Count"),
        clutch_1v2_wins=opt("1v2Wins"),
        utility_damage=opt("Utility Damage"),
        utility_count=opt("Utility Count"),
        enemies_flashed=opt("Enemies Flashed"),
        flash_count=opt("Flash Count"),
        sniper_kills=opt("Sniper Kills"),
        pistol_kills=opt("Pistol Kills"),
        win=str(s.get("Result", "0")) == "1",
    )
    stats.rating = hltv_rating_1(stats, rounds)
    return stats


def _team_from_details(faction: dict[str, Any]) -> TeamInfo:
    st = faction.get("stats") or {}
    roster = [
        RosterPlayer(
            player_id=r["player_id"],
            nickname=r.get("nickname", "?"),
            skill_level=_int(r.get("game_skill_level") or r.get("skill_level"), None),
            steam_id=r.get("game_player_id"),
        )
        for r in faction.get("roster") or faction.get("players") or []
    ]
    return TeamInfo(
        team_id=faction.get("faction_id") or faction.get("team_id") or "",
        name=faction.get("name") or faction.get("nickname") or "",
        avg_elo=_num(st.get("rating"), None),
        win_probability=_num(st.get("winProbability"), None),
        avg_skill_level=_num((st.get("skillLevel") or {}).get("average"), None),
        players=roster,
    )


def _overlap(a: TeamInfo, ids: set[str]) -> int:
    return sum(1 for p in a.players if p.player_id in ids)


def build_match(
    match_id: str,
    history_item: dict[str, Any] | None,
    details: dict[str, Any] | None,
    stats: dict[str, Any] | None,
) -> Match:
    m = Match(match_id=match_id)
    base_teams: list[TeamInfo] = []

    src = details or history_item
    if src:
        factions = src.get("teams") or {}
        base_teams = [_team_from_details(factions[k]) for k in ("faction1", "faction2") if k in factions]
        m.region = src.get("region")
        m.competition = src.get("competition_name")
        m.started_at = _ts(src.get("started_at"))
        m.finished_at = _ts(src.get("finished_at"))
        m.faceit_url = (src.get("faceit_url") or "").replace("{lang}", "en") or None
        res = src.get("results") or {}
        winner = res.get("winner")
        if winner in factions:
            m.winner_team_id = base_teams[0 if winner == "faction1" else 1].team_id
        if details:
            m.calculate_elo = details.get("calculate_elo")
            pick = ((details.get("voting") or {}).get("map") or {}).get("pick") or []
            m.map = pick[0] if pick else None
    if history_item and details:
        # history carries per-player skill levels when details roster lacks them
        levels = {
            p["player_id"]: p.get("skill_level")
            for f in (history_item.get("teams") or {}).values()
            for p in f.get("players", [])
        }
        for t in base_teams:
            for p in t.players:
                if p.skill_level is None and levels.get(p.player_id) is not None:
                    p.skill_level = int(levels[p.player_id])

    rnd = ((stats or {}).get("rounds") or [None])[0]
    if rnd:
        rs = rnd.get("round_stats") or {}
        m.map = rs.get("Map") or m.map
        m.region = m.region or rs.get("Region")
        m.rounds = _int(rs.get("Rounds"), None)
        m.winner_team_id = rs.get("Winner") or m.winner_team_id
        m.has_stats = True
        stat_teams: list[TeamInfo] = []
        for t in rnd.get("teams") or []:
            ts = t.get("team_stats") or {}
            players = [
                RosterPlayer(
                    player_id=p["player_id"],
                    nickname=p.get("nickname", "?"),
                    stats=normalize_player_stats(p, m.rounds or 0),
                )
                for p in t.get("players") or []
            ]
            stat_teams.append(
                TeamInfo(
                    team_id=t.get("team_id", ""),
                    name=ts.get("Team", ""),
                    score=_int(ts.get("Final Score"), None),
                    first_half=_int(ts.get("First Half Score"), None),
                    second_half=_int(ts.get("Second Half Score"), None),
                    overtime=_int(ts.get("Overtime score"), None),
                    players=players,
                )
            )
        if base_teams:
            # align stat teams with detail teams by roster overlap, keep detail-only fields
            for st in stat_teams:
                ids = {p.player_id for p in st.players}
                bt = max(base_teams, key=lambda b: _overlap(b, ids))
                st.avg_elo, st.win_probability, st.avg_skill_level = (
                    bt.avg_elo,
                    bt.win_probability,
                    bt.avg_skill_level,
                )
                st.name = bt.name or st.name
                levels = {p.player_id: (p.skill_level, p.steam_id) for p in bt.players}
                for p in st.players:
                    p.skill_level, p.steam_id = levels.get(p.player_id, (None, None))
            if m.winner_team_id and m.winner_team_id not in {t.team_id for t in stat_teams}:
                won = next(b for b in base_teams if b.team_id == m.winner_team_id)
                ids = {p.player_id for p in won.players}
                m.winner_team_id = max(stat_teams, key=lambda s: _overlap(s, ids)).team_id
        m.teams = stat_teams
    else:
        # history "score" counts maps won (1/0), not rounds, so it is intentionally not copied
        m.teams = base_teams
    return m
