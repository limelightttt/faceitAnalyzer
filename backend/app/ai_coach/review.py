"""What the coach must answer with, and the check that keeps only conclusions backed by dossier facts."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from .. import coach

Certainty = Literal["fact", "estimate", "hypothesis"]


class Point(BaseModel):
    title: str
    detail: str
    certainty: Certainty
    evidence: list[str]  # dossier fact ids


class Action(BaseModel):
    title: str
    detail: str
    evidence: list[str]
    goal_metric: str | None  # one of coach.METRICS, to turn the advice into a tracked goal
    goal_map: str | None


class Review(BaseModel):
    summary: str
    problems: list[Point]
    actions: list[Action]
    strengths: list[Point]


class Answer(BaseModel):
    answer: str
    memory: str = Field(description="Короткие заметки о игроке из этого разговора для следующих вопросов")


RULES = """Правила, которые нельзя нарушать:
- Работай только с досье. Каждый вывод опирается на факты досье: перечисли их id в evidence. Не придумывай \
цифры, матчи, раунды или события, которых нет в досье. Если данных мало — так и скажи.
- certainty: fact — прямо видно в цифрах; estimate — вывод из нескольких цифр; hypothesis — возможная \
причина, которую цифры не доказывают.
- Не советуй уклоняться от матчей (dodge). Не обвиняй тиммейтов и соперников, не оценивай токсичность.
- Говори с игроком на «ты», по-русски, коротко и конкретно: что делать в ближайших 10 матчах."""

REVIEW_SYSTEM = f"""Ты — тренер по Counter-Strike 2 для игрока FACEIT. Тебе дают досье: факты о его игре, \
посчитанные приложением (форма, карты, сравнение с лобби, демки, цели, Elo).

Задача: понять, что сильнее всего тянет его вниз и что делать.
- summary: 2–3 предложения — главное.
- problems: 2–4 проблемы, самые важные первыми.
- actions: 2–4 действия. Если действие можно отслеживать метрикой приложения, укажи goal_metric из списка \
{sorted(coach.METRICS)} (для map_win_rate ещё goal_map, например de_nuke), иначе null.
- strengths: 1–3 сильные стороны, чтобы игрок их не сломал.

{RULES}"""

CHAT_SYSTEM = f"""Ты — тренер по Counter-Strike 2 и продолжаешь разговор с игроком FACEIT после своего разбора \
его игры. Тебе дают досье, твой разбор, заметки из разговора и последние реплики.

- answer: ответ на новый вопрос, 3–8 предложений, ссылайся на цифры досье словами, а не id.
- memory: обнови заметки — что игрок рассказал о себе (роль, сетап, привычки, цели), до 600 символов. \
Старые полезные заметки сохраняй, лишнее убирай.
Если вопрос не про его игру в CS2, вежливо верни разговор к игре.

{RULES}"""


def checked(review: Review, facts: dict[str, Any]) -> dict[str, Any]:
    """Keep only points with existing evidence and show the cited facts from the dossier, not model text."""

    def evidence(ids: list[str]) -> list[dict[str, Any]]:
        return [{"id": i} | facts[i] for i in dict.fromkeys(ids) if i in facts]

    def goal(a: Action) -> dict[str, Any] | None:
        meta = coach.METRICS.get(a.goal_metric or "")
        if not meta or (meta.get("needs_map") and not a.goal_map):
            return None
        return {
            "metric": a.goal_metric,
            "map": a.goal_map if meta.get("needs_map") else None,
            "label": meta["label"],
        }

    def points(items: list[Point]) -> list[dict[str, Any]]:
        out = []
        for it in items:
            ev = evidence(it.evidence)
            if ev:
                out.append(
                    {"title": it.title, "detail": it.detail, "certainty": it.certainty, "evidence": ev}
                )
        return out

    actions = []
    for a in review.actions:
        ev = evidence(a.evidence)
        if ev:
            actions.append({"title": a.title, "detail": a.detail, "evidence": ev, "goal": goal(a)})
    return {
        "summary": review.summary,
        "problems": points(review.problems),
        "actions": actions,
        "strengths": points(review.strengths),
    }
