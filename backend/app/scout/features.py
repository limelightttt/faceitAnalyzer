"""Per-player features for scouting, built only from FACEIT Data API payloads."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import numpy as np

from ..analytics.rating import hltv_rating_1
from ..domain import PlayerMatchStats


def _f(v: Any) -> float | None:
    try:
        return float(str(v).replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def _ts(v: Any) -> datetime | None:
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v / 1000 if v > 1e11 else v, tz=UTC)
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None


def norm_map(label: str | None) -> str | None:
    if not label:
        return None
    s = label.strip().lower().replace(" ", "")
    return s if s.startswith("de_") else f"de_{s}"


@dataclass
class RecentMatch:
    match_id: str
    map: str | None
    won: bool | None
    kills: int
    deaths: int
    assists: int
    adr: float | None
    hs_pct: float | None
    rounds: int | None
    rating: float | None
    entry_count: int | None
    entry_wins: int | None
    sniper_kills: int | None
    utility_damage: float | None
    flash_successes: float | None
    at: datetime | None


def parse_recent(items: list[dict[str, Any]]) -> list[RecentMatch]:
    out = []
    for s in items:
        rounds = _f(s.get("Rounds"))
        if rounds is None and s.get("Score"):
            try:
                rounds = sum(int(x) for x in str(s["Score"]).split("/"))
            except ValueError:
                rounds = None
        kills, deaths = int(_f(s.get("Kills")) or 0), int(_f(s.get("Deaths")) or 0)
        rating = None
        if rounds:
            st = PlayerMatchStats(
                player_id="x",
                nickname="x",
                kills=kills,
                deaths=deaths,
                double_kills=int(_f(s.get("Double Kills")) or 0),
                triple_kills=int(_f(s.get("Triple Kills")) or 0),
                quadro_kills=int(_f(s.get("Quadro Kills")) or 0),
                penta_kills=int(_f(s.get("Penta Kills")) or 0),
            )
            rating = hltv_rating_1(st, int(rounds))
        res = s.get("Result")
        out.append(
            RecentMatch(
                match_id=str(s.get("Match Id") or s.get("match_id") or ""),
                map=norm_map(s.get("Map")),
                won=None if res in (None, "") else str(res) == "1",
                kills=kills,
                deaths=deaths,
                assists=int(_f(s.get("Assists")) or 0),
                adr=_f(s.get("ADR")),
                hs_pct=_f(s.get("Headshots %")),
                rounds=int(rounds) if rounds else None,
                rating=rating,
                entry_count=None if _f(s.get("Entry Count")) is None else int(_f(s.get("Entry Count"))),
                entry_wins=None if _f(s.get("Entry Wins")) is None else int(_f(s.get("Entry Wins"))),
                sniper_kills=None if _f(s.get("Sniper Kills")) is None else int(_f(s.get("Sniper Kills"))),
                utility_damage=_f(s.get("Utility Damage")),
                flash_successes=_f(s.get("Flash Successes")),
                at=_ts(s.get("Created At") or s.get("Updated At")),
            )
        )
    return out


@dataclass
class PlayerFeatures:
    player_id: str
    nickname: str
    faction: str
    steam_id: str | None
    avatar: str | None
    country: str | None
    elo: int | None
    level: int | None
    activated_at: datetime | None
    lifetime_matches: int | None
    lifetime_win_rate: float | None
    lifetime_kd: float | None
    lifetime_hs: float | None
    lifetime_adr: float | None
    recent: list[RecentMatch] = field(default_factory=list)
    map_segments: dict[str, dict[str, float | None]] = field(default_factory=dict)
    history_teammates: dict[str, int] = field(default_factory=dict)  # player_id -> shared matches (same team)
    history_matches: int = 0
    history_together: dict[str, list[tuple[str, bool | None]]] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    # --- derived -------------------------------------------------------------------------------
    def recent_agg(self, n: int | None = None) -> dict[str, float | None]:
        rec = self.recent[:n] if n else self.recent
        if not rec:
            return {"n": 0}
        kills = sum(r.kills for r in rec)
        deaths = sum(r.deaths for r in rec)
        decided = [r for r in rec if r.won is not None]
        adrs = [r.adr for r in rec if r.adr is not None]
        hs = [r.hs_pct for r in rec if r.hs_pct is not None]
        ratings = [r.rating for r in rec if r.rating is not None]
        rounds = sum(r.rounds or 0 for r in rec)
        ent = [r for r in rec if r.entry_count is not None]
        snip = [r for r in rec if r.sniper_kills is not None]
        return {
            "n": len(rec),
            "wins": sum(1 for r in decided if r.won),
            "win_rate": sum(1 for r in decided if r.won) / len(decided) if decided else None,
            "kd": kills / deaths if deaths else None,
            "kills": kills,
            "adr": float(np.mean(adrs)) if adrs else None,
            "hs": float(np.mean(hs)) if hs else None,
            "rating": float(np.mean(ratings)) if ratings else None,
            "rating_sd": float(np.std(ratings)) if len(ratings) > 2 else None,
            "entry_per_round": sum(r.entry_count for r in ent) / max(1, sum(r.rounds or 0 for r in ent))
            if ent
            else None,
            "entry_success": (sum(r.entry_wins or 0 for r in ent) / max(1, sum(r.entry_count for r in ent)))
            if ent and sum(r.entry_count for r in ent)
            else None,
            "sniper_share": sum(r.sniper_kills for r in snip) / max(1, sum(r.kills for r in snip))
            if snip
            else None,
            "rounds": rounds,
        }

    def account_age_days(self) -> float | None:
        if not self.activated_at:
            return None
        return (datetime.now(UTC) - self.activated_at).total_seconds() / 86400


def build_features(
    faction: str,
    roster_entry: dict[str, Any],
    profile: dict | None,
    lifetime: dict | None,
    recent_items: list[dict],
    history: list[dict],
) -> PlayerFeatures:
    cs2 = ((profile or {}).get("games") or {}).get("cs2") or {}
    lt = (lifetime or {}).get("lifetime") or {}
    pf = PlayerFeatures(
        player_id=roster_entry["player_id"],
        nickname=roster_entry.get("nickname") or (profile or {}).get("nickname", "?"),
        faction=faction,
        steam_id=cs2.get("game_player_id")
        or roster_entry.get("game_player_id")
        or (profile or {}).get("steam_id_64"),
        avatar=(profile or {}).get("avatar") or roster_entry.get("avatar") or None,
        country=(profile or {}).get("country"),
        elo=int(_f(cs2.get("faceit_elo"))) if _f(cs2.get("faceit_elo")) else None,
        level=int(_f(cs2.get("skill_level") or roster_entry.get("game_skill_level") or 0) or 0) or None,
        activated_at=_ts((profile or {}).get("activated_at")),
        lifetime_matches=int(_f(lt.get("Matches"))) if _f(lt.get("Matches")) is not None else None,
        lifetime_win_rate=(_f(lt.get("Win Rate %")) / 100) if _f(lt.get("Win Rate %")) is not None else None,
        lifetime_kd=_f(lt.get("Average K/D Ratio")),
        lifetime_hs=_f(lt.get("Average Headshots %")),
        lifetime_adr=_f(lt.get("ADR")),
        recent=parse_recent(recent_items),
    )
    for seg in (lifetime or {}).get("segments") or []:
        if str(seg.get("type", "Map")).lower() != "map" or str(seg.get("mode", "5v5")) != "5v5":
            continue
        st = seg.get("stats") or {}
        m = norm_map(seg.get("label"))
        if m:
            wr = _f(st.get("Win Rate %"))
            pf.map_segments[m] = {
                "matches": _f(st.get("Matches")),
                "win_rate": wr / 100 if wr is not None else None,
                "kd": _f(st.get("Average K/D Ratio")),
                "adr": _f(st.get("ADR")),
            }
    for h in history:
        teams = h.get("teams") or {}
        for fac in teams.values():
            ids = [p["player_id"] for p in fac.get("players", [])]
            if pf.player_id in ids:
                pf.history_matches += 1
                winner = (h.get("results") or {}).get("winner")
                key = next((k for k, v in teams.items() if v is fac), None)
                won = None if not winner else winner == key
                for other in ids:
                    if other != pf.player_id:
                        pf.history_teammates[other] = pf.history_teammates.get(other, 0) + 1
                        pf.history_together.setdefault(other, []).append((h.get("match_id", ""), won))
    return pf
