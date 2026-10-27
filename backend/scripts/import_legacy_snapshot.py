"""Convert the legacy bot's stored FACEIT /matches/{id}/stats responses into a fixture dataset.

Only real data is carried over. Profile and history files are *derived* from the stats payloads
(player id/nickname, team rosters, winner) and marked with "_derived": true; Elo and timestamps are
not invented.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "legacy" / "telegram-bot-go" / "cmd" / "data" / "limelightttt.json"
DST = ROOT / "backend" / "fixtures" / "faceit" / "real_limelightttt"
NICK = "limelightttt"


def main() -> None:
    stored = json.loads(SRC.read_text("utf-8"))
    for sub in ("players", "history", "stats"):
        (DST / sub).mkdir(parents=True, exist_ok=True)
    player_id = None
    items = []
    for m in stored:  # legacy file keeps the API history order (newest first)
        raw = m["raw"]
        (DST / "stats" / f"{m['match_id']}.json").write_text(
            json.dumps(raw, ensure_ascii=False, indent=1), "utf-8"
        )
        rnd = raw["rounds"][0]
        teams = {}
        winner = None
        for key, t in zip(("faction1", "faction2"), rnd["teams"], strict=True):
            teams[key] = {
                "team_id": t["team_id"],
                "nickname": t["team_stats"]["Team"],
                "players": [{"player_id": p["player_id"], "nickname": p["nickname"]} for p in t["players"]],
            }
            if t["team_id"] == rnd["round_stats"]["Winner"]:
                winner = key
            for p in t["players"]:
                if p["nickname"].lower() == NICK:
                    player_id = p["player_id"]
        items.append(
            {
                "_derived": True,
                "match_id": m["match_id"],
                "game_id": "cs2",
                "game_mode": "5v5",
                "region": rnd["round_stats"]["Region"],
                "status": "finished",
                "teams": teams,
                "results": {"winner": winner},
            }
        )
    if player_id is None:
        sys.exit("player not found in snapshot")
    (DST / "players" / f"{NICK}.json").write_text(
        json.dumps(
            {"_derived": True, "player_id": player_id, "nickname": NICK, "games": {"cs2": {"region": "EU"}}},
            indent=1,
        ),
        "utf-8",
    )
    (DST / "history" / f"{player_id}.json").write_text(
        json.dumps({"items": items}, ensure_ascii=False, indent=1), "utf-8"
    )
    (DST / "meta.json").write_text(
        json.dumps(
            {
                "kind": "real_snapshot",
                "description": "Реальные ответы FACEIT /matches/{id}/stats (10 матчей, ноябрь 2025), сохранённые старым "
                "Telegram-ботом. Профиль/история восстановлены из них; Elo и время матчей отсутствуют.",
            },
            ensure_ascii=False,
            indent=1,
        ),
        "utf-8",
    )
    print(f"wrote {len(items)} matches to {DST}")


if __name__ == "__main__":
    main()
