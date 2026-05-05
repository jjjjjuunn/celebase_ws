"""IMPL-AI-002 Phase 2 — real-call smoke + 추가 failure path.

기존 unit tests (test_llm_reranker.py) 가 cover 하지 않는 3 failure path:
- OpenAI 503
- OpenAI timeout
- Malformed JSON

happy path (real call) 는 RUN_LLM_REAL_CALL=1 일 때만 실제 OpenAI 호출.
일반 CI 에서는 skip.
"""

from __future__ import annotations

import os

import pytest
from openai import APITimeoutError, InternalServerError
from pydantic import ValidationError
from unittest.mock import AsyncMock, patch

from src.clients.llm_client import call_openai_ranker
from src.engine.allergen_filter import RecipeSlot
from src.engine.llm_reranker import _OUTPUT_SCHEMA, llm_rerank_and_narrate


def _slot(rid: str) -> RecipeSlot:
    return RecipeSlot(recipe_id=rid, meal_type="lunch", allergens=[], ingredients=[])


# ---------------------------------------------------------------------------
# Real-call happy path (RUN_LLM_REAL_CALL=1 gated)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.skipif(
    os.getenv("RUN_LLM_REAL_CALL") != "1",
    reason="RUN_LLM_REAL_CALL=1 환경변수 설정 시에만 실행 (실 OpenAI 비용 발생)",
)
async def test_real_call_happy_path_returns_structured_output() -> None:
    """실 OpenAI gpt-4.1-mini 호출 → structured output 검증.

    1 call ≈ $0.0013 (gpt-4.1-mini, 2.5K max output, 5 recipe).
    LLM_COST_CAP_USD=0.05 안전 범위.
    """
    system_prompt = (
        "You are a celebrity wellness coach. Rank recipes for the **ronaldo** "
        "persona. Return JSON matching the provided schema."
    )
    user_prompt = (
        "Recipes: r-001 (grilled chicken), r-002 (salmon bowl), r-003 (quinoa salad).\n"
        "plan_id=plan-smoke persona_id=ronaldo\n"
        "Set mode=llm and include all 3 recipes with at least 1 citation each."
    )

    parsed, prompt_hash, output_hash = await call_openai_ranker(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=_OUTPUT_SCHEMA,
    )

    assert parsed.mode == "llm"
    assert len(parsed.meals) >= 1
    assert all(m.recipe_id for m in parsed.meals)
    assert all(len(m.citations) >= 1 for m in parsed.meals)
    assert all(10 <= len(m.narrative) <= 300 for m in parsed.meals)
    assert len(prompt_hash) == 16
    assert len(output_hash) == 16


# ---------------------------------------------------------------------------
# Failure path 1 — OpenAI 503 InternalServerError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_openai_503_triggers_standard_fallback() -> None:
    pool = [_slot("r1"), _slot("r2")]
    plan = [[pool[0]], [pool[1]]]

    with (
        patch("src.engine.llm_reranker._should_run_llm", return_value=True),
        patch(
            "src.engine.llm_reranker.check_global_kill_switch",
            AsyncMock(return_value=False),
        ),
        patch(
            "src.engine.llm_reranker.try_claim_elite_quota",
            AsyncMock(return_value=True),
        ),
        patch("src.engine.llm_reranker.estimate_prompt_cost", return_value=0.001),
        patch(
            "src.engine.llm_reranker.call_openai_ranker",
            AsyncMock(
                side_effect=InternalServerError(
                    message="503 Service Unavailable",
                    response=AsyncMock(status_code=503),
                    body=None,
                )
            ),
        ),
    ):
        result = await llm_rerank_and_narrate(
            varied_plan=plan,
            candidate_pool=pool,
            llm_profile={"primary_goal": "weight_loss"},
            persona_id="ronaldo",
            plan_id="plan-503",
            user_id_hash="hash1",
            user_allergies=[],
            redis_client=AsyncMock(),
        )

    assert result.mode == "standard"
    assert result.provenance is None


# ---------------------------------------------------------------------------
# Failure path 2 — OpenAI timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_openai_timeout_triggers_standard_fallback() -> None:
    pool = [_slot("r1")]
    plan = [[pool[0]]]

    with (
        patch("src.engine.llm_reranker._should_run_llm", return_value=True),
        patch(
            "src.engine.llm_reranker.check_global_kill_switch",
            AsyncMock(return_value=False),
        ),
        patch(
            "src.engine.llm_reranker.try_claim_elite_quota",
            AsyncMock(return_value=True),
        ),
        patch("src.engine.llm_reranker.estimate_prompt_cost", return_value=0.001),
        patch(
            "src.engine.llm_reranker.call_openai_ranker",
            AsyncMock(side_effect=APITimeoutError(request=AsyncMock())),
        ),
    ):
        result = await llm_rerank_and_narrate(
            varied_plan=plan,
            candidate_pool=pool,
            llm_profile={"primary_goal": "weight_loss"},
            persona_id="ronaldo",
            plan_id="plan-timeout",
            user_id_hash="hash1",
            user_allergies=[],
            redis_client=AsyncMock(),
        )

    assert result.mode == "standard"


# ---------------------------------------------------------------------------
# Failure path 3 — Malformed JSON (Pydantic ValidationError)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_malformed_json_triggers_standard_fallback() -> None:
    pool = [_slot("r1")]
    plan = [[pool[0]]]

    with (
        patch("src.engine.llm_reranker._should_run_llm", return_value=True),
        patch(
            "src.engine.llm_reranker.check_global_kill_switch",
            AsyncMock(return_value=False),
        ),
        patch(
            "src.engine.llm_reranker.try_claim_elite_quota",
            AsyncMock(return_value=True),
        ),
        patch("src.engine.llm_reranker.estimate_prompt_cost", return_value=0.001),
        patch(
            "src.engine.llm_reranker.call_openai_ranker",
            AsyncMock(
                side_effect=ValidationError.from_exception_data(
                    "LlmRankedMealList",
                    [
                        {
                            "type": "missing",
                            "loc": ("meals",),
                            "input": {},
                        }
                    ],
                )
            ),
        ),
    ):
        result = await llm_rerank_and_narrate(
            varied_plan=plan,
            candidate_pool=pool,
            llm_profile={"primary_goal": "weight_loss"},
            persona_id="ronaldo",
            plan_id="plan-malformed",
            user_id_hash="hash1",
            user_allergies=[],
            redis_client=AsyncMock(),
        )

    assert result.mode == "standard"


# ---------------------------------------------------------------------------
# Failure path 4 — Redis ConnectionError on kill switch (fail-closed → standard)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redis_connection_error_triggers_standard_fallback() -> None:
    """Redis 다운 시 kill_switch 검사 실패 → standard mode 폴백."""
    pool = [_slot("r1")]
    plan = [[pool[0]]]

    redis_mock = AsyncMock()
    redis_mock.get = AsyncMock(side_effect=ConnectionError("Redis unreachable"))

    with patch("src.engine.llm_reranker._should_run_llm", return_value=True):
        result = await llm_rerank_and_narrate(
            varied_plan=plan,
            candidate_pool=pool,
            llm_profile={"primary_goal": "weight_loss"},
            persona_id="ronaldo",
            plan_id="plan-redis-down",
            user_id_hash="hash1",
            user_allergies=[],
            redis_client=redis_mock,
        )

    assert result.mode == "standard"
    assert result.provenance is None
