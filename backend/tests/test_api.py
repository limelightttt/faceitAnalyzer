import time

from fastapi.testclient import TestClient

from app.main import app


def test_endpoints_and_demo_upload(tmp_path):
    with TestClient(app) as c:
        h = c.get("/api/health").json()
        assert h["status"] == "ok" and "demoparser2" in h["demo_parser"]
        for ep in ("overview", "best-worst", "insights", "elo", "matchmaking"):
            assert c.get(f"/api/players/sim_player/{ep}").status_code == 200, ep
            assert c.get(f"/api/players/limelightttt/{ep}").status_code == 200, ep
        ov = c.get("/api/players/limelightttt/overview").json()
        mid = ov["matches"][0]["match_id"]
        detail = c.get(f"/api/players/limelightttt/matches/{mid}").json()
        assert len(detail["match"]["teams"]) == 2
        assert c.get("/api/players/no_such_player/overview").status_code == 404
        assert c.get("/api/players/sim_player/overview?limit=1").status_code == 422
        assert any(d["id"] == "sample00mirage" for d in c.get("/api/demos").json())
        assert c.get("/api/demos/sample00mirage").json()["analysis"]["map"] == "de_mirage"

        assert c.post("/api/demos", files={"file": ("x.txt", b"hi")}).status_code == 400
        r = c.post("/api/demos", files={"file": ("broken.dem", b"not a demo at all")})
        assert r.status_code == 202
        demo_id = r.json()["id"]
        for _ in range(100):
            meta = c.get(f"/api/demos/{demo_id}").json()["meta"]
            if meta["status"] not in ("queued", "parsing"):
                break
            time.sleep(0.1)
        assert meta["status"] == "error" and meta["error"]
        assert c.delete(f"/api/demos/{demo_id}").status_code == 204
