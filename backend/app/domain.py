"""Provider-independent domain models (also the public API schema)."""

from datetime import datetime

from pydantic import BaseModel

from .providers.base import DataSource


class PlayerMatchStats(BaseModel):
    player_id: str
    nickname: str
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    headshots: int = 0
    hs_pct: float = 0.0
    mvps: int = 0
    adr: float | None = None
    damage: int | None = None
    kr: float = 0.0
    kd: float = 0.0
    double_kills: int = 0
    triple_kills: int = 0
    quadro_kills: int = 0
    penta_kills: int = 0
    entry_count: int | None = None
    entry_wins: int | None = None
    first_kills: int | None = None
    clutch_1v1_count: int | None = None
    clutch_1v1_wins: int | None = None
    clutch_1v2_count: int | None = None
    clutch_1v2_wins: int | None = None
    utility_damage: int | None = None
    utility_count: int | None = None
    enemies_flashed: int | None = None
    flash_count: int | None = None
    sniper_kills: int | None = None
    pistol_kills: int | None = None
    win: bool = False
    rating: float = 0.0  # HLTV Rating 1.0 approximation, see analytics/rating.py


class RosterPlayer(BaseModel):
    player_id: str
    nickname: str
    skill_level: int | None = None
    steam_id: str | None = None
    stats: PlayerMatchStats | None = None


class TeamInfo(BaseModel):
    team_id: str
    name: str
    score: int | None = None
    first_half: int | None = None
    second_half: int | None = None
    overtime: int | None = None
    avg_elo: float | None = None  # FACEIT match details: teams.<faction>.stats.rating
    win_probability: float | None = None
    avg_skill_level: float | None = None
    players: list[RosterPlayer] = []


class Match(BaseModel):
    match_id: str
    map: str | None = None
    region: str | None = None
    competition: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    rounds: int | None = None
    winner_team_id: str | None = None
    teams: list[TeamInfo] = []
    faceit_url: str | None = None
    has_stats: bool = False
    calculate_elo: bool | None = None


class PlayerProfile(BaseModel):
    player_id: str
    nickname: str
    avatar: str | None = None
    country: str | None = None
    region: str | None = None
    elo: int | None = None
    skill_level: int | None = None
    steam_id: str | None = None
    faceit_url: str | None = None


class DataQuality(BaseModel):
    source: DataSource
    matches_requested: int
    matches_loaded: int
    matches_with_stats: int
    has_timestamps: bool
    has_team_elo: bool
    has_official_elo: bool
    notes: list[str] = []


class PlayerMatch(BaseModel):
    """A match seen from the focus player's perspective."""

    match: Match
    team_index: int
    won: bool | None
    stats: PlayerMatchStats | None
    team_avg_elo: float | None
    opp_avg_elo: float | None
    win_probability: float | None
    party_size: int  # inferred, 1 = solo (see analytics/party.py)
    party_members: list[str] = []
    score_for: int | None = None
    score_against: int | None = None


class PlayerDataset(BaseModel):
    profile: PlayerProfile
    matches: list[PlayerMatch]  # newest first
    quality: DataQuality
