"""Parse a demo and store its analysis as the bundled sample (fixtures/demos)."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.demo.analysis import analyze_demo  # noqa: E402
from app.demo.parser import parse_demo  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "demos"


def main(path: str) -> None:
    a = analyze_demo(parse_demo(Path(path)), "test_demo.dem (demoparser2 test suite)")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "sample_analysis.json").write_text(json.dumps(a, ensure_ascii=False), "utf-8")
    t = a["teams"]
    meta = {
        "id": "sample00mirage",
        "file_name": a["file_name"],
        "status": "done",
        "source": "sample",
        "created_at": datetime(2026, 1, 1, tzinfo=UTC).isoformat(),
        "map": a["map"],
        "rounds": a["rounds_played"],
        "score": f"{t[0]['score']}:{t[1]['score']}",
        "players": len(a["players"]),
        "highlights": len(a["highlights"]),
        "sample_version": 2,
        "parser": a["parser"],
        "note": "Реальная CS2-демка (Valve MM, de_mirage) из тестов demoparser2, MIT. Предварительно разобрана.",
    }
    (OUT / "sample_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
    print("ok", meta)


if __name__ == "__main__":
    main(sys.argv[1])
