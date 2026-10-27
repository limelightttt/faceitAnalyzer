"""Uploaded demo storage + background parsing in a separate process (parsing is CPU-bound)."""

import json
import multiprocessing
import shutil
import uuid
from concurrent.futures import Future, ProcessPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .analysis import analyze_demo
from .parser import DemoParseError, decompress_if_needed, parse_demo


def _process_demo(src: str, out_path: str, file_name: str) -> dict[str, Any]:
    """Runs in a worker process."""
    path = decompress_if_needed(Path(src))
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
    def __init__(self, root: Path, keep_files: bool = False):
        self.root = root
        self.keep_files = keep_files
        root.mkdir(parents=True, exist_ok=True)
        self._pool: ProcessPoolExecutor | None = None
        self._futures: dict[str, Future] = {}

    def _pool_get(self) -> ProcessPoolExecutor:
        if self._pool is None:
            self._pool = ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn"))
        return self._pool

    def _meta_path(self, demo_id: str) -> Path:
        return self.root / demo_id / "meta.json"

    def _write_meta(self, meta: dict[str, Any]) -> None:
        self._meta_path(meta["id"]).write_text(json.dumps(meta, ensure_ascii=False), "utf-8")

    def get_meta(self, demo_id: str) -> dict[str, Any] | None:
        p = self._meta_path(demo_id)
        if not p.exists() or not demo_id.replace("-", "").isalnum():
            return None
        meta = json.loads(p.read_text("utf-8"))
        fut = self._futures.get(demo_id)
        if fut is not None and fut.done():
            self._futures.pop(demo_id)
            try:
                meta.update(fut.result(), status="done", finished_at=datetime.now(UTC).isoformat())
            except DemoParseError as exc:
                meta.update(status="error", error=str(exc))
            except Exception as exc:  # parser crash on malformed input
                meta.update(status="error", error=f"Ошибка парсинга: {exc.__class__.__name__}: {exc}")
            self._write_meta(meta)
            self._cleanup(demo_id)
        elif fut is None and meta["status"] in ("queued", "parsing"):
            meta.update(
                status="error", error="Обработка прервана перезапуском сервера — загрузите демо снова"
            )
            self._write_meta(meta)
        return meta

    def _cleanup(self, demo_id: str) -> None:
        if self.keep_files:
            return
        for f in (self.root / demo_id).iterdir():
            if f.name not in ("meta.json", "analysis.json"):
                f.unlink(missing_ok=True)

    def list(self) -> list[dict[str, Any]]:
        metas = [self.get_meta(p.name) for p in self.root.iterdir() if p.is_dir()]
        return sorted([m for m in metas if m], key=lambda m: m["created_at"], reverse=True)

    def create(self, file_name: str, source: str = "upload") -> tuple[str, Path]:
        demo_id = uuid.uuid4().hex[:12]
        d = self.root / demo_id
        d.mkdir(parents=True)
        safe = "".join(c for c in Path(file_name).name if c.isalnum() or c in "._-") or "demo.dem"
        self._write_meta(
            {
                "id": demo_id,
                "file_name": file_name,
                "status": "queued",
                "source": source,
                "created_at": datetime.now(UTC).isoformat(),
            }
        )
        return demo_id, d / safe

    def submit(self, demo_id: str, path: Path) -> None:
        meta = json.loads(self._meta_path(demo_id).read_text("utf-8"))
        meta.update(status="parsing", size=path.stat().st_size)
        self._write_meta(meta)
        self._futures[demo_id] = self._pool_get().submit(
            _process_demo, str(path), str(self.root / demo_id / "analysis.json"), meta["file_name"]
        )

    def analysis(self, demo_id: str) -> dict[str, Any] | None:
        p = self.root / demo_id / "analysis.json"
        return json.loads(p.read_text("utf-8")) if p.exists() else None

    def delete(self, demo_id: str) -> bool:
        d = self.root / demo_id
        if not d.exists() or not demo_id.isalnum():
            return False
        shutil.rmtree(d)
        return True

    def seed_sample(self, sample_dir: Path) -> None:
        """Install the pre-parsed sample (real CS2 demo from the demoparser2 test suite) once."""
        src_meta, src_an = sample_dir / "sample_meta.json", sample_dir / "sample_analysis.json"
        if not src_meta.exists() or not src_an.exists():
            return
        meta = json.loads(src_meta.read_text("utf-8"))
        d = self.root / meta["id"]
        if d.exists():
            return
        d.mkdir(parents=True)
        shutil.copy(src_an, d / "analysis.json")
        self._write_meta(meta)

    def shutdown(self) -> None:
        if self._pool:
            self._pool.shutdown(cancel_futures=True)
