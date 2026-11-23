"""Claude calls of the coach. Each call is one bounded request: the chat never resends its whole history."""

import json
from dataclasses import dataclass
from typing import Any

import anthropic
import httpx2

from .review import CHAT_SYSTEM, REVIEW_SYSTEM, Answer, Review

# USD per million tokens: input, output, cache read, cache write (5-minute cache = 1.25x input)
PRICES = {
    "claude-opus-5-5": (4.0, 20.0, 0.20, 5.0),
    "claude-sonnet-5-5": (2.0, 10.0, 0.10, 2.5),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
}
FALLBACK_PRICE = PRICES["claude-opus-5-5"]  # unknown model: count conservatively
FALLBACK_BETA = "server-side-fallback-2026-07-01"  # a declined request is retried on a fallback model


@dataclass
class Usage:
    model: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int

    @property
    def cost_usd(self) -> float:
        i, o, cr, cw = PRICES.get(self.model, FALLBACK_PRICE)
        tokens = (self.input_tokens, self.output_tokens, self.cache_read_tokens, self.cache_write_tokens)
        return round(sum(t * p for t, p in zip(tokens, (i, o, cr, cw), strict=True)) / 1e6, 6)


class CoachUnavailable(Exception):
    """No answer to show. `usage` is set when the call reached the model and was billed anyway."""

    def __init__(self, message: str, status: int, usage: Usage | None = None):
        super().__init__(message)
        self.status, self.usage = status, usage


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True)


class ClaudeCoach:
    def __init__(
        self,
        api_key: str,
        review_model: str,
        chat_model: str,
        transport: httpx2.AsyncBaseTransport | None = None,
    ):
        http = (
            httpx2.AsyncClient(transport=transport, timeout=httpx2.Timeout(300, connect=10))
            if transport
            else None
        )
        self.client = anthropic.AsyncAnthropic(api_key=api_key, max_retries=2, http_client=http)
        self.review_model, self.chat_model = review_model, chat_model

    async def review(self, dossier: dict[str, Any]) -> tuple[Review, Usage]:
        return await self._call(
            self.review_model,
            "high",
            REVIEW_SYSTEM,
            [{"type": "text", "text": "Досье игрока (JSON):\n" + _dump(dossier)}],
            Review,
            max_tokens=16000,
        )

    async def answer(
        self,
        dossier: dict[str, Any],
        review: dict[str, Any],
        memory: str,
        turns: list[tuple[str, str]],
        question: str,
    ) -> tuple[Answer, Usage]:
        recent = "\n".join(f"{'Игрок' if role == 'player' else 'Коуч'}: {text}" for role, text in turns)
        return await self._call(
            self.chat_model,
            "low",
            CHAT_SYSTEM,
            [
                # the same for the whole conversation: cached, so follow-ups pay ~10% for it
                {
                    "type": "text",
                    "text": "Досье игрока (JSON):\n"
                    + _dump(dossier)
                    + "\n\nТвой разбор (JSON):\n"
                    + _dump(review),
                    "cache_control": {"type": "ephemeral"},
                },
                {
                    "type": "text",
                    "text": f"Заметки из разговора: {memory or 'пока нет'}\n\n"
                    f"Последние реплики:\n{recent or 'нет'}\n\nНовый вопрос игрока: {question}",
                },
            ],
            Answer,
            max_tokens=4000,
        )

    async def _call(self, model, effort, system, content, schema, max_tokens):
        try:
            resp = await self.client.beta.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": content}],
                output_config={
                    "effort": effort,
                    "format": {"type": "json_schema", "schema": anthropic.transform_schema(schema)},
                },
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.AuthenticationError as exc:
            raise CoachUnavailable(
                "Ключ Claude API не подходит — проверьте ANTHROPIC_API_KEY", status=503
            ) from exc
        except anthropic.RateLimitError as exc:
            raise CoachUnavailable(
                "Claude API перегружен или упёрся в лимит — попробуйте через минуту", status=503
            ) from exc
        except anthropic.APIStatusError as exc:
            raise CoachUnavailable(f"Claude API ответил ошибкой {exc.status_code}", status=502) from exc
        except anthropic.APIConnectionError as exc:
            raise CoachUnavailable("Нет связи с Claude API", status=503) from exc
        u = resp.usage
        usage = Usage(
            resp.model,
            u.input_tokens,
            u.output_tokens,
            u.cache_read_input_tokens or 0,
            u.cache_creation_input_tokens or 0,
        )
        # usage is read first: a refusal or a cut-off answer is billed too
        text = next((b.text for b in resp.content if b.type == "text"), "")
        try:
            if resp.stop_reason == "refusal":
                raise ValueError("refusal")
            return schema.model_validate_json(text), usage
        except ValueError as exc:  # pydantic.ValidationError is a ValueError
            raise CoachUnavailable(
                "Коуч не смог ответить на этот запрос — переформулируйте вопрос", status=502, usage=usage
            ) from exc
