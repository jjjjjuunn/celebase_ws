"""OpenAI API client for LLM Enhancement Layer — spec.md §5.8, LLM-DESIGN.md §S3/S5/S8/S9."""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

import tiktoken
from openai import AsyncOpenAI, OpenAIError

from ..config import settings
from ..engine.llm_schema import LlmRankedMealList

__all__ = [
    "sanitize_celeb_source",
    "estimate_prompt_cost",
    "check_global_kill_switch",
    "check_elite_quota",
    "call_openai_ranker",
]

_logger = logging.getLogger(__name__)

# LLM-DESIGN §S8 — 토큰 카운팅 인코딩 (GPT-4.1-mini/GPT-5-nano 모두 cl100k_base)
_ENCODING = tiktoken.get_encoding("cl100k_base")

# LLM-DESIGN §S9 — Redis key 패턴
_QUOTA_KEY_TMPL = "llm:quota:{user_id_hash}:{date}"
_KILL_SWITCH_KEY = "llm_disabled"
_COST_KILL_KEY = "llm_cost_kill"
_MONTHLY_COST_KEY = "llm:cost:monthly"


# ---------------------------------------------------------------------------
# Injection defense
# ---------------------------------------------------------------------------


def sanitize_celeb_source(raw_text: str) -> str:
    """XML closing tag 이스케이프 — LLM-DESIGN §S5, Gemini BS-NEW-01.

    공격자가 <celeb_source> 구분자를 조기 종료하여 system prompt에 도달하는
    indirect injection을 차단한다.
    """
    return raw_text.replace("</celeb_source>", "<\\/celeb_source>")


# ---------------------------------------------------------------------------
# Cost estimation (Gate 0)
# ---------------------------------------------------------------------------


def estimate_prompt_cost(system_prompt: str, user_prompt: str) -> float:
    """tiktoken으로 입력 토큰 추정 후 예상 비용을 반환한다 — LLM-DESIGN §S7 Gate 0.

    실제 output 비용은 max_tokens 상한으로 보수적 산정.
    """
    input_tokens = len(_ENCODING.encode(system_prompt)) + len(
        _ENCODING.encode(user_prompt)
    )
    estimated = (
        input_tokens / 1_000_000 * settings.LLM_INPUT_PRICE_PER_1M_USD
        + settings.LLM_MAX_OUTPUT_TOKENS / 1_000_000 * settings.LLM_OUTPUT_PRICE_PER_1M_USD
    )
    return estimated


# ---------------------------------------------------------------------------
# Redis guards
# ---------------------------------------------------------------------------


async def check_global_kill_switch(redis_client: Any) -> bool:
    """Redis kill switch가 활성화된 경우 True 반환 — LLM-DESIGN §S11."""
    disabled = await redis_client.get(_KILL_SWITCH_KEY)
    cost_kill = await redis_client.get(_COST_KILL_KEY)
    return bool(disabled) or bool(cost_kill)


async def check_elite_quota(
    redis_client: Any,
    user_id_hash: str,
    date_str: str,
) -> bool:
    """Elite 일일 quota 초과 시 True 반환 — LLM-DESIGN §S8, Gemini BS-04.

    Redis 카운터 llm:quota:{user_id_hash}:{YYYYMMDD}, TTL = 86400s.
    """
    key = _QUOTA_KEY_TMPL.format(user_id_hash=user_id_hash, date=date_str)
    raw = await redis_client.get(key)
    count = int(raw) if raw else 0
    return count >= settings.ELITE_DAILY_LLM_SOFT_LIMIT


async def increment_elite_quota(
    redis_client: Any,
    user_id_hash: str,
    date_str: str,
) -> None:
    """LLM 호출 성공 후 quota 카운터를 증가시킨다."""
    key = _QUOTA_KEY_TMPL.format(user_id_hash=user_id_hash, date=date_str)
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, 86400)
    await pipe.execute()


# ---------------------------------------------------------------------------
# Core API call
# ---------------------------------------------------------------------------


def _hash16(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


async def call_openai_ranker(
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    model: str = "gpt-4.1-mini",
) -> tuple[LlmRankedMealList, str, str]:
    """OpenAI Structured Output 호출 — LLM-DESIGN §S5, §S8.

    Returns:
        (parsed_result, prompt_hash, output_hash)

    Raises:
        OpenAIError: API 오류 (caller가 try/except로 표준 모드 폴백 처리).
        ValidationError: Pydantic 파싱 실패 (Safety Gate 1).
    """
    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=settings.LLM_TIMEOUT_SECONDS,
        max_retries=1,
    )

    prompt_hash = _hash16(system_prompt + user_prompt)

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "llm_ranked_meal_list", "schema": json_schema},
        },
        max_tokens=settings.LLM_MAX_OUTPUT_TOKENS,
        temperature=0.3,
    )

    raw_content: str = response.choices[0].message.content or ""
    output_hash = _hash16(raw_content)

    _logger.info(
        "llm_call prompt_hash=%s output_hash=%s model=%s",
        prompt_hash,
        output_hash,
        model,
    )

    # Safety Gate 1: Pydantic 파싱 — 실패 시 ValidationError propagate (caller 처리)
    parsed = LlmRankedMealList.model_validate(json.loads(raw_content))
    return parsed, prompt_hash, output_hash
