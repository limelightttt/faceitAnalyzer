"""Write the clearly-labelled synthetic demo dataset to fixtures/faceit/synthetic_demo."""

import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.synthetic import generate  # noqa: E402

DST = Path(__file__).resolve().parents[1] / "fixtures" / "faceit" / "synthetic_demo"


def main() -> None:
    data = generate()
    shutil.rmtree(DST, ignore_errors=True)
    for sub in ("players", "history", "matches", "stats"):
        (DST / sub).mkdir(parents=True)
    pid = data["profile"]["player_id"]
    (DST / "players" / f"{data['profile']['nickname']}.json").write_text(
        json.dumps(data["profile"], indent=1)
    )
    (DST / "history" / f"{pid}.json").write_text(
        json.dumps({"items": data["history"], "start": 0, "end": len(data["history"])})
    )
    for mid, d in data["details"].items():
        (DST / "matches" / f"{mid}.json").write_text(json.dumps(d))
        (DST / "stats" / f"{mid}.json").write_text(json.dumps(data["stats"][mid]))
    (DST / "meta.json").write_text(
        json.dumps(
            {
                "kind": "synthetic",
                "description": "СИНТЕТИКА: 150 матчей, сгенерированных app/synthetic.py (seed=7) в точном формате FACEIT "
                "Data API v4. Матчмейкинг по Elo без скрытого пула. Только для демонстрации функций, "
                "которым нужны Elo и время матчей.",
            },
            ensure_ascii=False,
            indent=1,
        )
    )
    print("final elo", data["truth"], "->", DST)


if __name__ == "__main__":
    main()
