"""Offline provider backed by JSON files laid out like the FACEIT Data API.

Used by automated tests and the local mock FACEIT server only — never as a silent production fallback.

fixtures/faceit/<dataset>/
    meta.json                    {"kind": "real_snapshot" | "synthetic", "description": "..."}
    players/<nickname>.json      GET /players?nickname=   (also GET /players/{id})
    history/<player_id>.json     GET /players/{id}/history  ({"items": [...]})
    lifetime/<player_id>.json    GET /players/{id}/stats/cs2           (optional)
    games_stats/<player_id>.json GET /players/{id}/games/cs2/stats     (optional)
    matches/<match_id>.json      GET /matches/{id}                     (optional)
    stats/<match_id>.json        GET /matches/{id}/stats               (optional)
"""

import json
from pathlib import Path
from typing import Any

from .base import DataSource, PlayerNotFound


class FixtureProvider:
    name = "fixtures"

    def __init__(self, root: Path):
        self.root = root
        self._datasets: dict[str, tuple[Path, dict[str, Any]]] = {}
        self._by_nick: dict[str, tuple[Path, dict]] = {}
        self._by_id: dict[str, tuple[Path, dict]] = {}
        self._by_steam: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if not self.root.exists():
            return
        for ds in sorted(p for p in self.root.iterdir() if p.is_dir()):
            meta_path = ds / "meta.json"
            if not meta_path.exists():
                continue
            self._datasets[ds.name] = (ds, json.loads(meta_path.read_text("utf-8")))
            for pf in (ds / "players").glob("*.json"):
                player = json.loads(pf.read_text("utf-8"))
                self._by_nick[player["nickname"].lower()] = (ds, player)
                self._by_id[player["player_id"]] = (ds, player)
                steam = ((player.get("games") or {}).get("cs2") or {}).get("game_player_id")
                if steam:
                    self._by_steam[str(steam)] = player

    def has_player(self, nickname: str) -> bool:
        return nickname.lower() in self._by_nick

    def datasets(self) -> list[dict[str, Any]]:
        return [
            {"dataset": n, "kind": m["kind"], "description": m.get("description", "")}
            for n, (_, m) in self._datasets.items()
        ]

    def source_for(self, nickname: str) -> DataSource:
        hit = self._by_nick.get(nickname.lower())
        return self._datasets[hit[0].name][1]["kind"] if hit else "synthetic"

    @staticmethod
    def _read(path: Path) -> dict[str, Any] | None:
        return json.loads(path.read_text("utf-8")) if path.exists() else None

    async def get_player(self, nickname: str) -> dict[str, Any]:
        hit = self._by_nick.get(nickname.lower())
        if hit is None:
            raise PlayerNotFound(nickname)
        return hit[1]

    async def get_player_by_id(self, player_id: str) -> dict[str, Any]:
        hit = self._by_id.get(player_id)
        if hit is None:
            raise PlayerNotFound(player_id)
        return hit[1]

    async def get_player_by_steam(self, steam_id: str) -> dict[str, Any] | None:
        return self._by_steam.get(str(steam_id))

    async def get_history(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        hit = self._by_id.get(player_id)
        if hit is None:
            return []
        data = self._read(hit[0] / "history" / f"{player_id}.json") or {"items": []}
        return data["items"][:limit]

    async def get_lifetime_stats(self, player_id: str) -> dict[str, Any] | None:
        hit = self._by_id.get(player_id)
        return self._read(hit[0] / "lifetime" / f"{player_id}.json") if hit else None

    async def get_recent_match_stats(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        hit = self._by_id.get(player_id)
        data = self._read(hit[0] / "games_stats" / f"{player_id}.json") if hit else None
        return [it.get("stats", it) for it in (data or {}).get("items", [])][:limit]

    def _match_dir(self, match_id: str) -> Path | None:
        for ds, _ in self._datasets.values():
            if (ds / "stats" / f"{match_id}.json").exists() or (ds / "matches" / f"{match_id}.json").exists():
                return ds
        return None

    async def get_match(self, match_id: str) -> dict[str, Any] | None:
        ds = self._match_dir(match_id)
        return self._read(ds / "matches" / f"{match_id}.json") if ds else None

    async def get_match_stats(self, match_id: str) -> dict[str, Any] | None:
        ds = self._match_dir(match_id)
        return self._read(ds / "stats" / f"{match_id}.json") if ds else None
