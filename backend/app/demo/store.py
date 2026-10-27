"""Uploaded demo storage + background parsing in a separate process (parsing is CPU-bound).

Safety: ids are server-generated hex, file names are sanitized, decompression is capped
(MAX_DECOMPRESSED_BYTES) and a parse that exceeds `parse_timeout_s` is killed. Ownership: every demo has
an `owner` (user id or None for the open developer mode); the bundled sample is visible to everyone.
"""

from __future__ import annotations

import json
import multiprocessing
import re
import shutil
import time
import uuid
from concurrent.futures import Future, ProcessPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .analysis import analyze_demo
from .parser import DemoParseError, decompress_if_needed, parse_demo

ID_RE = re.compile(r"^[0-9a-z]{6,32}$")
MAX_DECOMPRESSED_BYTES = 3 * 1024**3  # a full FACEIT demo is ~100-400 MB


def _process_demo(src: str, out_path: str, file_name: str, max_bytes: int) -> dict[str, Any]:
    """Runs in a worker process."""
    path = decompress_if_needed(Path(src), max_bytes)
    analysis = analyze_demo(parse_demo(path), file_name)
    Path(out_path).write_text(json.dumps(analysis, ensure_ascii=False), "utf-8")
    teams = analysis["teams"]
    return {
        "map": analysis["map"],
        "rounds": analysis["rounds_played"],
        "score": f"{teams[0]['score']}:{teams[1]['score']}",
        "players": len(analysis["players"]),
        "highlights": len(analysis["highlights"]),
        "parser": analysis["parser"],
    }


class DemoStore:
    def __init__(
        self,
        root: Path,
        keep_files: bool = False,
        parse_timeout_s: float = 600.0,
        max_decompressed_bytes: int = MAX_DECOMPRESSED_BYTES,
    ):
        self.on_done = None  # callback(demo_id, analysis) — e.g. tactical ingestion
        self.on_delete = None  # callback(demo_id, analysis)
        self.root = root
        self.keep_files = keep_files
        self.parse_timeout_s = parse_timeout_s
        self.max_decompressed_bytes = max_decompressed_bytes
        root.mkdir(parents=True, exist_ok=True)
        self._pool: ProcessPoolExecutor | None = None
        self._futures: dict[str, Future] = {}
        self._started: dict[str, float] = {}
        self._receiving: set[str] = set()  # created in this process, upload still streaming

    def _pool_get(self) -> ProcessPoolExecutor:
        if self._pool is None:
            self._pool = ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn"))
        return self._pool

    def _kill_pool(self) -> None:
        """A hung parser cannot be cancelled cooperatively: terminate the worker and start a fresh pool."""
        if self._pool is None:
            return
        for proc in list(getattr(self._pool, "_processes", {}).values()):
            proc.terminate()
        self._pool.shutdown(wait=False, cancel_futures=True)
        self._pool = None
        for demo_id in list(self._futures):
            self._futures.pop(demo_id)
            meta = self._read_meta(demo_id)
            if meta and meta["status"] in ("queued", "parsing"):
                meta.update(
                    status="error",
                    error="Разбор остановлен: другая демка превысила лимит времени, загрузите снова",
                )
                self._write_meta(meta)

    def _dir(self, demo_id: str) -> Path | None:
        return self.root / demo_id if ID_RE.match(demo_id or "") else None

    def _meta_path(self, demo_id: str) -> Path:
        return self.root / demo_id / "meta.json"

    def _read_meta(self, demo_id: str) -> dict[str, Any] | None:
        d = self._dir(demo_id)
        if d is None or not (d / "meta.json").exists():
            return None
        return json.loads((d / "meta.json").read_text("utf-8"))

    def _write_meta(self, meta: dict[str, Any]) -> None:
        self._meta_path(meta["id"]).write_text(json.dumps(meta, ensure_ascii=False), "utf-8")

    def get_meta(self, demo_id: str) -> dict[str, Any] | None:
        meta = self._read_meta(demo_id)
        if meta is None:
            return None
        fut = self._futures.get(demo_id)
        if fut is not None and fut.done():
            self._futures.pop(demo_id)
            self._started.pop(demo_id, None)
            try:
                meta.update(fut.result(), status="done", finished_at=datetime.now(UTC).isoformat())
                self._write_meta(meta)
                if self.on_done:
                    self.on_done(demo_id, self.analysis(demo_id) or {})
            except DemoParseError as exc:
                meta.update(status="error", error=str(exc))
            except Exception as exc:  # parser crash on malformed input
                meta.update(status="error", error=f"Ошибка парсинга: {exc.__class__.__name__}: {exc}")
            self._write_meta(meta)
            self._cleanup(demo_id)
        elif (
            fut is not None
            and time.monotonic() - self._started.get(demo_id, time.monotonic()) > self.parse_timeout_s
        ):
            self._kill_pool()
            meta.update(
                status="error",
                error=f"Разбор не уложился в {self.parse_timeout_s / 60:.0f} мин и был остановлен",
            )
            self._write_meta(meta)
            self._cleanup(demo_id)
        elif fut is None and meta["status"] in ("queued", "parsing") and demo_id not in self._receiving:
            meta.update(
                status="error", error="Обработка прервана перезапуском сервера — загрузите демо снова"
            )
            self._write_meta(meta)
            self._cleanup(demo_id)
        return meta

    def _cleanup(self, demo_id: str) -> None:
        if self.keep_files:
            return
        d = self._dir(demo_id)
        for f in d.iterdir() if d and d.exists() else []:
            if f.name not in ("meta.json", "analysis.json"):
                f.unlink(missing_ok=True)

    @staticmethod
    def visible(meta: dict[str, Any], user_id: int | None) -> bool:
        return meta.get("source") == "sample" or meta.get("owner") == user_id

    def list(self, user_id: int | None = None) -> list[dict[str, Any]]:
        metas = [self.get_meta(p.name) for p in self.root.iterdir() if p.is_dir()]
        return sorted(
            [m for m in metas if m and self.visible(m, user_id)], key=lambda m: m["created_at"], reverse=True
        )

    def all_done(self) -> list[dict[str, Any]]:
        metas = [self.get_meta(p.name) for p in self.root.iterdir() if p.is_dir()]
        return [m for m in metas if m and m["status"] == "done"]

    def find_by_hash(self, sha256: str, user_id: int | None) -> dict[str, Any] | None:
        for m in self.list(user_id):
            if m.get("sha256") == sha256 and m["status"] in ("done", "parsing", "queued"):
                return m
        return None

    def create(self, file_name: str, owner: int | None, source: str = "upload") -> tuple[str, Path]:
        demo_id = uuid.uuid4().hex[:12]
        d = self.root / demo_id
        d.mkdir(parents=True)
        safe = "".join(c for c in Path(file_name).name if c.isalnum() or c in "._-").lstrip(".") or "demo.dem"
        self._write_meta(
            {
                "id": demo_id,
                "file_name": Path(file_name).name[:120],
                "status": "queued",
                "source": source,
                "owner": owner,
                "created_at": datetime.now(UTC).isoformat(),
            }
        )
        self._receiving.add(demo_id)
        return demo_id, d / safe[:120]

    def submit(self, demo_id: str, path: Path, sha256: str | None = None) -> None:
        self._receiving.discard(demo_id)
        meta = self._read_meta(demo_id)
        meta.update(status="parsing", size=path.stat().st_size, sha256=sha256)
        self._write_meta(meta)
        self._started[demo_id] = time.monotonic()
        self._futures[demo_id] = self._pool_get().submit(
            _process_demo,
            str(path),
            str(self.root / demo_id / "analysis.json"),
            meta["file_name"],
            self.max_decompressed_bytes,
        )

    def analysis(self, demo_id: str) -> dict[str, Any] | None:
        d = self._dir(demo_id)
        p = d / "analysis.json" if d else None
        return json.loads(p.read_text("utf-8")) if p and p.exists() else None

    def delete(self, demo_id: str) -> bool:
        d = self._dir(demo_id)
        if d is None or not d.exists():
            return False
        analysis = self.analysis(demo_id)
        self._futures.pop(demo_id, None)
        self._receiving.discard(demo_id)
        shutil.rmtree(d)
        if self.on_delete and analysis:
            self.on_delete(demo_id, analysis)
        return True

    def seed_sample(self, sample_dir: Path) -> None:
        """Install the pre-parsed sample (real CS2 demo from the demoparser2 test suite) once."""
        src_meta, src_an = sample_dir / "sample_meta.json", sample_dir / "sample_analysis.json"
        if not src_meta.exists() or not src_an.exists():
            return
        meta = json.loads(src_meta.read_text("utf-8"))
        current = self._read_meta(meta["id"])
        if current and current.get("sample_version") == meta.get("sample_version"):
            return
        d = self.root / meta["id"]
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(src_an, d / "analysis.json")
        self._write_meta(meta)
        if self.on_done:
            self.on_done(meta["id"], self.analysis(meta["id"]) or {})

    def shutdown(self) -> None:
        if self._pool:
            self._pool.shutdown(cancel_futures=True)
