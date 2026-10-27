"""Party (premade) inference.

The FACEIT Data API does not expose party membership for matchmaking games (the `premade` flag in
/stats is only set for full premade teams). We therefore infer it: a teammate who shared the focus
player's team in at least `min_shared` of the loaded matches AND in >= `min_share` of them is treated as a
probable party member. This is a heuristic and is labelled as such in the UI.
"""

from collections import Counter

from ..domain import PlayerMatch


def infer_parties(
    matches: list[PlayerMatch], player_id: str, min_shared: int = 3, min_share: float = 0.15
) -> dict[str, int]:
    counts: Counter[str] = Counter()
    names: dict[str, str] = {}
    for pm in matches:
        team = pm.match.teams[pm.team_index]
        for p in team.players:
            if p.player_id != player_id:
                counts[p.player_id] += 1
                names[p.player_id] = p.nickname
    n = max(len(matches), 1)
    frequent = {pid for pid, c in counts.items() if c >= min_shared and c / n >= min_share}
    for pm in matches:
        team = pm.match.teams[pm.team_index]
        members = [p.nickname for p in team.players if p.player_id in frequent]
        pm.party_members = members
        pm.party_size = 1 + len(members)
    return {names[pid]: counts[pid] for pid in frequent}
