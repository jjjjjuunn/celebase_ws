"""Pipeline final_out guard tests (IMPL-AI-002 Phase 1.3).

BS-NEW-03 회귀 방지 — `mode`, `quota_exceeded`, `ui_hint`, `llm_provenance`
4 키가 standard / llm 양쪽 경로에서 항상 set 되는지 검증한다.
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import patch

import pytest

from src.engine.allergen_filter import RecipeSlot
from src.engine.llm_schema import LlmProvenance, LlmRerankResult
from src.engine.pipeline import run_pipeline


_REQUIRED_KEYS = {"mode", "quota_exceeded", "ui_hint", "llm_provenance"}


def _mk_slot(rid: str, meal: str = "lunch") -> RecipeSlot:
    return RecipeSlot(recipe_id=rid, meal_type=meal, allergens=[], ingredients=[])


def _baseline_inputs() -> Dict[str, Any]:
    pool: List[RecipeSlot] = [_mk_slot(f"r{i}") for i in range(3)]
    return {
        "plan_id": "plan-final-out",
        "base_diet": {"recipes": list(pool)},
        "bio_profile": {
            "weight_kg": 70,
            "activity_level": "moderate",
            "tdee": 2200,
            "primary_goal": "maintenance",
        },
        "preferences": {"allergies": [], "intolerances": []},
        "candidate_pool": pool,
        "duration_days": 3,
        "on_progress": lambda _p: None,
    }


@pytest.mark.asyncio
async def test_final_out_always_includes_mode_flags_standard_path() -> None:
    """LLM 비활성 (redis_client/llm_context None) → mode='standard'."""
    result = await run_pipeline(**_baseline_inputs())

    assert _REQUIRED_KEYS.issubset(result.keys()), result
    assert result["mode"] == "standard"
    assert result["quota_exceeded"] is False
    assert result["ui_hint"] == "일시적인 지연으로 기본 식단을 제공합니다."
    assert result["llm_provenance"] is None


@pytest.mark.asyncio
async def test_final_out_always_includes_mode_flags_llm_path() -> None:
    """LLM 활성 + reranker 성공 → mode='llm', llm_provenance dict."""
    inputs = _baseline_inputs()
    fake_pool = inputs["candidate_pool"]

    provenance = LlmProvenance(
        model="gpt-4.1-mini",
        prompt_hash="a" * 16,
        output_hash="b" * 16,
        mode="llm",
    )
    fake_result = LlmRerankResult(
        ranked_plan=[[fake_pool[0]]] * inputs["duration_days"],
        mode="llm",
        provenance=provenance,
        quota_exceeded=False,
    )

    with (
        patch("src.engine.pipeline.settings.ENABLE_LLM_MEAL_PLANNER", True),
        patch(
            "src.engine.pipeline.llm_rerank_and_narrate",
            return_value=fake_result,
        ),
    ):
        result = await run_pipeline(
            **inputs,
            redis_client=object(),
            llm_context={"persona_id": "p1", "user_id_hash": "h1"},
        )

    assert _REQUIRED_KEYS.issubset(result.keys()), result
    assert result["mode"] == "llm"
    assert result["quota_exceeded"] is False
    assert result["ui_hint"] is None
    assert isinstance(result["llm_provenance"], dict)
    assert result["llm_provenance"]["model"] == "gpt-4.1-mini"
