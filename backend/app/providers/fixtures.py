"""Offline provider backed by JSON files laid out like the FACEIT Data API.

fixtures/faceit/<dataset>/
    meta.json                    {"kind": "real_snapshot" | "synthetic", "description": "..."}
    players/<nickname>.json      GET /players?nickname=
    history/<player_id>.json     GET /players/{id}/history  ({"items": [...]})
    matches/<match_id>.json      GET /matches/{id}         (optional)
    stats/<match_id>.json        GET /matches/{id}/stats   (optional)
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
        self._player_index: dict[str, Path] = {}
        self._id_index: dict[str, Path] = {}
        self._load()

    def _load(self) -> None:
        if not self.root.exists():
            return
        for ds in sorted(p for p in self.root.iterdir() if p.is_dir()):
            meta_path = ds / "meta.json"
            if not meta_path.exists():
                continue
            meta = json.loads(meta_path.read_text("utf-8"))
            self._datasets[ds.name] = (ds, meta)
            for pf in (ds / "players").glob("*.json"):
                player = json.loads(pf.read_text("utf-8"))
                self._player_index[player["nickname"].lower()] = ds
                self._id_index[player["player_id"]] = ds

    def datasets(self) -> list[dict[str, Any]]:
        out = []
        for name, (ds, meta) in self._datasets.items():
            players = [json.loads(p.read_text("utf-8"))["nickname"] for p in (ds / "players").glob("*.json")]
            out.append(
                {
                    "dataset": name,
                    "kind": meta["kind"],
                    "description": meta.get("description", ""),
                    "players": sorted(players),
                }
            )
        return out

    def source_for(self, nickname: str) -> DataSource:
        ds = self._player_index.get(nickname.lower())
        if ds is None:
            return "synthetic"
        return self._datasets[ds.name][1]["kind"]

    def _read(self, path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        return json.loads(path.read_text("utf-8"))

    async def get_player(self, nickname: str) -> dict[str, Any]:
        ds = self._player_index.get(nickname.lower())
        if ds is None:
            raise PlayerNotFound(nickname)
        for pf in (ds / "players").glob("*.json"):
            data = json.loads(pf.read_text("utf-8"))
            if data["nickname"].lower() == nickname.lower():
                return data
        raise PlayerNotFound(nickname)

    async def get_history(self, player_id: str, limit: int) -> list[dict[str, Any]]:
        ds = self._id_index.get(player_id)
        if ds is None:
            return []
        data = self._read(ds / "history" / f"{player_id}.json") or {"items": []}
        return data["items"][:limit]

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
