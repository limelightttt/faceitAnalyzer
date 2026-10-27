"""Rating formulas. All are published approximations, documented here so numbers are auditable."""

from typing import Protocol

# HLTV Rating 1.0 (2010) constants: average values for a pro-level player.
_AVG_KPR = 0.679
_AVG_SPR = 0.317
_AVG_RMK = 1.277


class _Stats(Protocol):
    kills: int
    deaths: int
    double_kills: int
    triple_kills: int
    quadro_kills: int
    penta_kills: int


def hltv_rating_1(s: _Stats, rounds: int) -> float:
    """HLTV Rating 1.0 = (KillRating + 0.7*SurvivalRating + MultiKillRating) / 2.7.

    FACEIT stats give 2k-5k round counts but not 1k rounds; single-kill rounds are estimated as
    kills - 2*2k - 3*3k - 4*4k - 5*5k (exact unless a round had >5 kills, impossible in 5v5).
    """
    if rounds <= 0:
        return 0.0
    singles = max(
        s.kills - 2 * s.double_kills - 3 * s.triple_kills - 4 * s.quadro_kills - 5 * s.penta_kills, 0
    )
    kill_rating = s.kills / rounds / _AVG_KPR
    survival_rating = max(rounds - s.deaths, 0) / rounds / _AVG_SPR
    rmk = (
        singles + 4 * s.double_kills + 9 * s.triple_kills + 16 * s.quadro_kills + 25 * s.penta_kills
    ) / rounds
    return round((kill_rating + 0.7 * survival_rating + rmk / _AVG_RMK) / 2.7, 3)
