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
    "try_claim_elite_quota",
    "increment_elite_quota",
    "increment_monthly_cost",
    "call_openai_ranker",
]

_logger = logging.getLogger(__name__)

# LLM-DESIGN §S8 — 토큰 카운팅 인코딩: 모델별 인코딩 자동 선택 (BS-04)
try:
    _ENCODING = tiktoken.encoding_for_model(settings.OPENAI_MODEL)
except KeyError:
    _ENCODING = tiktoken.get_encoding("o200k_base")

# LLM-DESIGN §S9 — Redis key 패턴
_QUOTA_KEY_TMPL = "llm:quota:{user_id_hash}:{date}"
_KILL_SWITCH_KEY = "llm_disabled"
_COST_KILL_KEY = "llm_cost_kill"
_MONTHLY_COST_KEY = "llm:cost:monthly"

# 월별 비용 key TTL: 32일 (월 경계 넘기지 않도록 충분히)
_MONTHLY_TTL_SECONDS = 32 * 86400


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


async def try_claim_elite_quota(
    redis_client: Any,
    user_id_hash: str,
    date_str: str,
    limit: int,
) -> bool:
    """원자적 quota 예약 — TOCTOU 방지 (Gemini BS-02), TTL 원자적 설정 (BS-13).

    pipeline()으로 INCR + EXPIRE를 원자적으로 실행한다.
    이렇게 하면 INCR 후 프로세스 종료 시 TTL 미설정으로 영구 quota 소진 버그를 방지한다.
    TTL은 매 호출마다 갱신되므로 실질적으로 24시간 rolling window가 된다.

    Returns:
        True if quota slot successfully claimed (proceed with LLM call).
        False if over limit (return standard mode).
    """
    key = _QUOTA_KEY_TMPL.format(user_id_hash=user_id_hash, date=date_str)
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, 86400)
    results = await pipe.execute()
    new_count: int = results[0]
    if new_count > limit:
        await redis_client.decr(key)
        return False
    return True


async def increment_monthly_cost(redis_client: Any, cost_usd: float) -> None:
    """월별 LLM 비용 누적 + kill switch 자동 발화 — BS-10, LLM-DESIGN §S13.

    INCRBYFLOAT로 `llm:cost:monthly` 키에 비용을 누적하고,
    LLM_MONTHLY_KILL_USD 초과 시 `llm_cost_kill` 키를 자동 설정한다.
    """
    new_total: float = float(
        await redis_client.incrbyfloat(_MONTHLY_COST_KEY, cost_usd)
    )
    # 첫 기록 시 TTL 설정 (epsilon 범위 내에서 첫 누적 판단)
    if abs(new_total - cost_usd) < 1e-6:
        await redis_client.expire(_MONTHLY_COST_KEY, _MONTHLY_TTL_SECONDS)

    if new_total >= settings.LLM_MONTHLY_KILL_USD:
        await redis_client.set(_COST_KILL_KEY, "1")
        _logger.error(
            "llm_monthly_kill_triggered total_usd=%.2f limit=%.2f",
            new_total,
            settings.LLM_MONTHLY_KILL_USD,
        )
    elif new_total >= settings.LLM_MONTHLY_WARN_USD:
        _logger.warning(
            "llm_monthly_warn total_usd=%.2f limit=%.2f",
            new_total,
            settings.LLM_MONTHLY_WARN_USD,
        )


# ---------------------------------------------------------------------------
# Core API call
# ---------------------------------------------------------------------------


def _hash16(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


async def call_openai_ranker(
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any],
    model: str | None = None,
) -> tuple[LlmRankedMealList, str, str]:
    """OpenAI Structured Output 호출 — LLM-DESIGN §S5, §S8.

    async with 로 httpx 연결을 명시적으로 닫는다 (BS-11).

    Returns:
        (parsed_result, prompt_hash, output_hash)

    Raises:
        OpenAIError: API 오류 (caller가 try/except로 표준 모드 폴백 처리).
        ValidationError: Pydantic 파싱 실패 (Safety Gate 1).
    """
    _model = model or settings.OPENAI_MODEL
    prompt_hash = _hash16(system_prompt + user_prompt)

    async with AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=settings.LLM_TIMEOUT_SECONDS,
        max_retries=1,
    ) as client:
        response = await client.chat.completions.create(
            model=_model,
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
        _model,
    )

    # Safety Gate 1: Pydantic 파싱 — 실패 시 ValidationError propagate (caller 처리)
    parsed = LlmRankedMealList.model_validate(json.loads(raw_content))
    return parsed, prompt_hash, output_hash
