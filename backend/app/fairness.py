"""Match fairness: is a match even, or does one side start with an edge Elo does not show?

FACEIT's 50/50 is computed from Elo only. Elo lags behind the real level of a fresh account that keeps
winning (a smurf, a second account, a bought account), and a party can mix very different Elo. Both make a
match unequal although the official chance says "even". We report it from facts, per match:

* Elo lag: an account with few matches (< LAG_MAX_MATCHES) that keeps winning has not reached its level yet.
  A sustained win rate w against equal-Elo lobbies means a gap of 400*log10(w/(1-w)) Elo; w is shrunk toward
  50% (LAG_PRIOR pseudo-matches) and the lag capped at +-LAG_CAP. "Real chance" is the Elo formula on the team
  Elo plus the mean lag of its five players.
* Smurf signs: few matches on the account and strong numbers (K/D, win rate, or Elo gained per match).
  These are statistical signs of an account playing below its level, never a verdict on a person.
* Party spread: a likely premade (from co-occurrence in the players' last matches) mixing far apart Elo.
* Stack vs solo: a party of four or five against players queueing alone or in pairs.

A match is "against you" when the facts against your side outnumber those in your favour.
"""

import math
from dataclasses import dataclass, field
from typing import Any

from .scout import chemistry
from .scout.features import PlayerFeatures
from .scout.strength import elo_expectation

START_ELO = 1000
LAG_MAX_MATCHES = 300  # older accounts: Elo has had time to converge
LAG_PRIOR = 20
LAG_CAP = 300
SMURF_MAX_MATCHES = 150
SMURF_MIN_ELO = 1700  # level 8+: below that a fresh strong account is ordinary climbing
SMURF_KD = 1.3
SMURF_WIN_RATE = 0.6
SMURF_ELO_PER_MATCH = 10  # a win gives ~25 Elo: 10+ per match on average means winning almost always
PARTY_SPREAD = 800
STACK = 4
UNEVEN_CHANCE = 0.35


def elo_lag(p: PlayerFeatures) -> int:
    n, wr = p.lifetime_matches, p.lifetime_win_rate
    if not n or wr is None or n >= LAG_MAX_MATCHES:
        return 0
    w = (wr * n + 0.5 * LAG_PRIOR) / (n + LAG_PRIOR)
    return round(max(-LAG_CAP, min(LAG_CAP, 400 * math.log10(w / (1 - w)))))


def smurf_signs(p: PlayerFeatures) -> list[str]:
    n = p.lifetime_matches
    if not n or n >= SMURF_MAX_MATCHES or not p.elo or p.elo < SMURF_MIN_ELO:
        return []
    signs = []
    if p.lifetime_kd is not None and p.lifetime_kd >= SMURF_KD:
        signs.append(f"K/D {p.lifetime_kd:.2f}")
    if p.lifetime_win_rate is not None and n >= 15 and p.lifetime_win_rate >= SMURF_WIN_RATE:
        signs.append(f"побед {p.lifetime_win_rate:.0%}")
    per_match = (p.elo - START_ELO) / n
    if per_match >= SMURF_ELO_PER_MATCH:
        signs.append(f"+{per_match:.0f} Elo за матч")
    return signs


@dataclass
class Side:
    players: list[PlayerFeatures]
    avg_elo: float | None  # team Elo at match time when known, else the current average
    exclude: set[str] = field(default_factory=set)  # player ids not counted as matchmaking-assigned (you)

    def summary(self) -> dict[str, Any]:
        known = [p for p in self.players if p.elo]
        avg = self.avg_elo if self.avg_elo else (sum(p.elo for p in known) / len(known) if known else None)
        lag = round(sum(elo_lag(p) for p in self.players) / 5)  # five slots; unknown accounts add nothing
        elo = {p.nickname: p.elo for p in self.players}
        parties = []
        for g in chemistry.groups(chemistry.team_pairs(self.players)):
            elos = [elo[n] for n in g if elo.get(n)]
            parties.append({"members": g, "spread": (max(elos) - min(elos)) if len(elos) > 1 else 0})
        return {
            "avg_elo": round(avg) if avg else None,
            "lag": lag,
            "effective_elo": round(avg + lag) if avg else None,
            "smurfs": [
                {
                    "nickname": p.nickname,
                    "matches": p.lifetime_matches,
                    "elo": p.elo,
                    "signs": signs,
                }
                for p in self.players
                if p.player_id not in self.exclude and (signs := smurf_signs(p))
            ],
            "parties": parties,
            "largest_party": max((len(x["members"]) for x in parties), default=1),
            "max_spread": max((x["spread"] for x in parties), default=0),
        }


def _smurf_text(s: dict[str, Any]) -> str:
    return f"{s['nickname']} ({s['matches']} матчей, {', '.join(s['signs'])})"


def verdict(you: Side, them: Side, official_chance: float | None) -> dict[str, Any]:
    a, b = you.summary(), them.summary()
    chance_elo = official_chance
    if chance_elo is None and a["avg_elo"] and b["avg_elo"]:
        chance_elo = elo_expectation(a["avg_elo"], b["avg_elo"])
    real = (
        elo_expectation(a["effective_elo"], b["effective_elo"])
        if a["effective_elo"] and b["effective_elo"]
        else None
    )
    against: list[str] = []
    favour: list[str] = []

    def both(cond_them: bool, cond_you: bool, text_them: str, text_you: str) -> None:
        if cond_them and not cond_you:
            against.append(text_them)
        elif cond_you and not cond_them:
            favour.append(text_you)

    if real is not None and chance_elo is not None:
        detail = f"реальный шанс {real:.0%} при {chance_elo:.0%} по Elo"
        if real <= UNEVEN_CHANCE:
            against.append(f"Соперники сильнее, чем показывает Elo: {detail}")
        elif real >= 1 - UNEVEN_CHANCE:
            favour.append(f"Вы сильнее, чем показывает Elo: {detail}")
    if len(b["smurfs"]) > len(a["smurfs"]):
        against.append("Смурф-признаки у соперников: " + "; ".join(_smurf_text(s) for s in b["smurfs"]))
    elif len(a["smurfs"]) > len(b["smurfs"]):
        favour.append("Смурф-признаки в вашей команде: " + "; ".join(_smurf_text(s) for s in a["smurfs"]))
    both(
        b["max_spread"] >= PARTY_SPREAD,
        a["max_spread"] >= PARTY_SPREAD,
        f"У соперников пачка с разбросом {b['max_spread']} Elo",
        f"В вашей команде пачка с разбросом {a['max_spread']} Elo",
    )
    both(
        b["largest_party"] >= STACK and a["largest_party"] <= 2,
        a["largest_party"] >= STACK and b["largest_party"] <= 2,
        f"Пачка из {b['largest_party']} против соло и дуо",
        f"Ваша пачка из {a['largest_party']} против соло и дуо",
    )
    score = len(against) - len(favour)
    code = "against" if score > 0 else "favour" if score < 0 else "even"
    return {
        "code": code,
        "label": {
            "against": "НЕРАВНЫЙ МАТЧ — против вас",
            "favour": "Неравный матч — в вашу пользу",
            "even": "Равный матч",
        }[code],
        "chance_elo": round(chance_elo, 3) if chance_elo is not None else None,
        "chance_real": round(real, 3) if real is not None else None,
        "against": against,
        "favour": favour,
        "you": a,
        "them": b,
    }
