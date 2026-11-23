"""AI coach: billing rules (cache, limits, budget), evidence checks, bounded chat, Claude request shape."""

import json

import httpx
import httpx2
import pytest
from fastapi.testclient import TestClient

from app.ai_coach.llm import ClaudeCoach, CoachUnavailable, Usage
from app.ai_coach.review import Action, Answer, Point, Review
from app.main import create_app
from app.providers.faceit_api import FaceitApiProvider
from tests.conftest import login, make_settings
from tests.support.mock_faceit import create_mock


class FakeCoach:
    def __init__(self):
        self.reviews = 0
        self.questions: list[dict] = []

    async def review(self, dossier):
        self.reviews += 1
        self.dossier = dossier
        return (
            Review(
                summary="Форма просела.",
                problems=[
                    Point(
                        title="Проигрываешь чаще",
                        detail="WR упал",
                        certainty="fact",
                        evidence=["form.recent.win_rate"],
                    ),
                    Point(title="Выдумка", detail="нет данных", certainty="hypothesis", evidence=["made.up"]),
                ],
                actions=[
                    Action(
                        title="Подними ADR",
                        detail="…",
                        evidence=["form.recent.adr"],
                        goal_metric="adr",
                        goal_map=None,
                    ),
                    Action(
                        title="Карта",
                        detail="…",
                        evidence=["profile.elo"],
                        goal_metric="map_win_rate",
                        goal_map=None,
                    ),
                ],
                strengths=[],
            ),
            Usage("claude-opus-5-5", 10_000, 3_000, 0, 0),
        )

    async def answer(self, dossier, review, memory, turns, question):
        self.questions.append({"turns": list(turns), "memory": memory, "question": question})
        return Answer(answer=f"Ответ на: {question}", memory=f"заметок: {len(self.questions)}"), Usage(
            "claude-sonnet-5-5", 300, 200, 9_000, 0
        )


def _app(tmp_path, fake=None, **settings):
    mock = create_mock()
    provider = FaceitApiProvider(
        "test-key",
        "http://mock/data/v4",
        tmp_path / "cache",
        rate=1000,
        transport=httpx.ASGITransport(app=mock),
    )
    s = make_settings(tmp_path, auth_dev_login=True, faceit_provider="api", **settings)
    return TestClient(create_app(s, provider=provider, coach_llm=fake), base_url="http://localhost:8000")


def test_disabled_without_a_key(tmp_path):
    with _app(tmp_path) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        assert c.get("/api/coach/ai").json()["enabled"] is False
        r = c.post("/api/coach/ai/review", headers=h)
        assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_review_keeps_only_backed_conclusions_and_never_pays_twice(tmp_path):
    fake = FakeCoach()
    with _app(tmp_path, fake, coach_reviews_per_day=1) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        r = c.post("/api/coach/ai/review", headers=h).json()
        assert [p["title"] for p in r["problems"]] == ["Проигрываешь чаще"]  # "made.up" evidence dropped
        ev = r["problems"][0]["evidence"][0]
        assert (
            ev["id"] == "form.recent.win_rate"
            and ev["value"] == fake.dossier["facts"]["form.recent.win_rate"]["value"]
        )
        assert r["actions"][0]["goal"] == {"metric": "adr", "map": None, "label": "ADR"}
        assert r["actions"][1]["goal"] is None  # map goal without a map
        assert all(
            k.split(".")[0] in {"profile", "elo", "form", "map", "lobby", "week", "demo", "mistake", "goal"}
            for k in fake.dossier["facts"]
        )

        again = c.post("/api/coach/ai/review", headers=h).json()
        assert again["cached"] is True and again["id"] == r["id"] and fake.reviews == 1  # same data: free
        st = c.get("/api/coach/ai").json()
        assert st["limits"]["reviews"]["left"] == 0 and st["limits"]["reviews"]["reset_at"]
        assert st["review"]["id"] == r["id"] and st["new_matches"] == 0

        c.post(
            "/api/coach/goals", json={"metric": "adr"}, headers=h
        )  # the data changed: a new review would be billed
        blocked = c.post("/api/coach/ai/review", headers=h)
        assert blocked.status_code == 429 and "1 разбора за 24 часа" in blocked.json()["detail"]
        assert fake.reviews == 1


def test_owner_has_no_daily_limits_but_the_budget_applies(tmp_path):
    fake = FakeCoach()
    with _app(tmp_path, fake, coach_owner="Scout_Me", coach_reviews_per_day=0) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        st = c.get("/api/coach/ai").json()
        assert st["owner"] is True and st["limits"]["reviews"]["limit"] is None
        assert c.post("/api/coach/ai/review", headers=h).status_code == 200
    fake = FakeCoach()
    with _app(tmp_path / "b", fake, coach_owner="scout_me", coach_monthly_budget_usd=0) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        r = c.post("/api/coach/ai/review", headers=h)
        assert r.status_code == 503 and "бюджет" in r.json()["detail"] and fake.reviews == 0


def test_chat_sends_notes_and_last_replies_not_the_whole_history(tmp_path):
    fake = FakeCoach()
    with _app(tmp_path, fake, coach_questions_per_day=8) as c:
        h = {"X-CSRF-Token": login(c, "scout_me")}
        assert c.post("/api/coach/ai/ask", json={"question": "Что делать?"}, headers=h).status_code == 409
        c.post("/api/coach/ai/review", headers=h)
        for i in range(8):
            r = c.post("/api/coach/ai/ask", json={"question": f"Вопрос {i}"}, headers=h)
            assert r.json()["answer"] == f"Ответ на: Вопрос {i}"
        assert max(len(q["turns"]) for q in fake.questions) == 4  # bounded, however long the chat gets
        assert fake.questions[-1]["memory"] == "заметок: 7"  # the coach's own notes carry older context
        assert fake.questions[-1]["turns"][-1] == ("coach", "Ответ на: Вопрос 6")
        assert len(c.get("/api/coach/ai").json()["review"]["messages"]) == 16
        r = c.post("/api/coach/ai/ask", json={"question": "Ещё"}, headers=h)
        assert r.status_code == 429 and "вопросов" in r.json()["detail"]


def _claude(handler):
    return ClaudeCoach(
        "sk-test", "claude-opus-5-5", "claude-sonnet-5-5", transport=httpx2.MockTransport(handler)
    )


def _message(payload, stop="end_turn", model="claude-opus-5-5"):
    return httpx2.Response(
        200,
        json={
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": model,
            "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
            "stop_reason": stop,
            "stop_sequence": None,
            "usage": {
                "input_tokens": 12_000,
                "output_tokens": 2_000,
                "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0,
            },
        },
    )


async def test_claude_requests_are_structured_and_priced():
    seen = []

    def handler(req: httpx2.Request):
        seen.append((req.headers, json.loads(req.content)))
        if json.loads(req.content)["model"] == "claude-opus-5-5":
            return _message({"summary": "ок", "problems": [], "actions": [], "strengths": []})
        return _message({"answer": "да", "memory": "роль: AWP"}, model="claude-sonnet-5-5")

    coach = _claude(handler)
    review, usage = await coach.review({"facts": {}})
    assert review.summary == "ок" and usage.cost_usd == pytest.approx(12_000 * 4 / 1e6 + 2_000 * 20 / 1e6)
    headers, body = seen[0]
    assert (
        body["output_config"]["effort"] == "high" and body["output_config"]["format"]["type"] == "json_schema"
    )
    assert body["fallbacks"] == "default" and "server-side-fallback-2026-07-01" in headers["anthropic-beta"]

    answer, _ = await coach.answer(
        {"facts": {}}, {"summary": "ок"}, "", [("player", "привет"), ("coach", "привет")], "как?"
    )
    _, body = seen[1]
    assert answer.memory == "роль: AWP" and body["model"] == "claude-sonnet-5-5"
    assert len(body["messages"]) == 1  # one bounded turn, never the replayed chat
    context, rest = body["messages"][0]["content"]
    assert context["cache_control"] == {"type": "ephemeral"} and "Досье" in context["text"]
    assert "Игрок: привет" in rest["text"] and "Новый вопрос игрока: как?" in rest["text"]


async def test_a_refusal_is_reported_and_still_counted():
    coach = _claude(lambda req: _message({}, stop="refusal"))
    with pytest.raises(CoachUnavailable) as exc:
        await coach.review({"facts": {}})
    assert exc.value.usage and exc.value.usage.output_tokens == 2_000
