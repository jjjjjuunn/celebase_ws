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


@pytest.mark.asyncio
async def test_daily_totals_are_actual_sum_not_target() -> None:
    """P0.3 회귀 보호 — daily_totals 가 실제 slot.nutrition 합산."""
    pool: List[RecipeSlot] = [
        RecipeSlot(
            recipe_id="r0",
            meal_type="lunch",
            allergens=[],
            ingredients=[],
            nutrition={
                "calories": 500,
                "protein_g": 30,
                "carbs_g": 50,
                "fat_g": 15,
            },
        ),
        RecipeSlot(
            recipe_id="r1",
            meal_type="dinner",
            allergens=[],
            ingredients=[],
            nutrition={
                "calories": 600,
                "protein_g": 40,
                "carbs_g": 60,
                "fat_g": 20,
            },
        ),
        RecipeSlot(
            recipe_id="r2",
            meal_type="breakfast",
            allergens=[],
            ingredients=[],
            nutrition={
                "calories": 300,
                "protein_g": 20,
                "carbs_g": 40,
                "fat_g": 8,
            },
        ),
    ]
    inputs = _baseline_inputs()
    inputs["base_diet"] = {"recipes": list(pool)}
    inputs["candidate_pool"] = pool

    result = await run_pipeline(**inputs)
    week = result["weekly_plan"]
    assert len(week) >= 1

    day0 = week[0]
    assert "daily_totals" in day0
    assert day0["daily_totals"]["calories"] > 0
    valid_sums = {500.0, 600.0, 300.0, 800.0, 900.0, 1100.0, 1400.0}
    assert day0["daily_totals"]["calories"] in valid_sums, day0["daily_totals"]


@pytest.mark.asyncio
async def test_daily_targets_preserve_target_values() -> None:
    """daily_targets 필드가 target_kcal/macros 를 그대로 보존한다."""
    result = await run_pipeline(**_baseline_inputs())
    week = result["weekly_plan"]
    assert len(week) >= 1

    day0 = week[0]
    assert "daily_targets" in day0
    targets = day0["daily_targets"]
    assert targets["target_kcal"] == result["target_kcal"]
    for key in ("target_kcal", "protein_g", "carbs_g", "fat_g"):
        assert key in targets


@pytest.mark.asyncio
async def test_daily_totals_llm_mode_uses_varied_plan_not_dict_ranked_plan() -> None:
    """LLM mode 회귀 보호 (codex review-r1 CRITICAL fix):

    `llm_reranker.py` 의 `ranked_plan` 은 list[list[dict]] (recipe_id/meal_type/rank
    /narrative/citations 만, nutrition 부재). aggregate_day 가 dict.nutrition 접근
    시 AttributeError 발생 → LLM mode 전체 crash 회귀를 막는다.

    합산 source = varied_plan[i] (RecipeSlot 보장). LLM rerank 는 enrichment 만
    부여 + day/slot 구조 보존 → 영양 합산은 standard 와 LLM mode 동일.
    """
    pool: List[RecipeSlot] = [
        RecipeSlot(
            recipe_id="r0",
            meal_type="lunch",
            allergens=[],
            ingredients=[],
            nutrition={"calories": 500, "protein_g": 30, "carbs_g": 50, "fat_g": 15},
        ),
    ]
    inputs = _baseline_inputs()
    inputs["base_diet"] = {"recipes": list(pool)}
    inputs["candidate_pool"] = pool

    provenance = LlmProvenance(
        model="gpt-4.1-mini",
        prompt_hash="a" * 16,
        output_hash="b" * 16,
        mode="llm",
    )
    # llm_reranker 실제 출력 형태 — dict 리스트.
    dict_day = [
        {
            "recipe_id": "r0",
            "meal_type": "lunch",
            "rank": 1,
            "narrative": "test",
            "citations": [],
        }
    ]
    fake_result = LlmRerankResult(
        ranked_plan=[dict_day] * inputs["duration_days"],  # type: ignore[arg-type]
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

    assert result["mode"] == "llm"
    week = result["weekly_plan"]
    day0 = week[0]
    # meals 는 dict 형식 (llm_reranker 출력 그대로)
    assert isinstance(day0["meals"][0], dict)
    assert "narrative" in day0["meals"][0]
    # daily_totals 는 varied_plan 의 RecipeSlot 합산 — calories 500.0
    assert day0["daily_totals"]["calories"] == 500.0


@pytest.mark.asyncio
async def test_daily_totals_micronutrients_nested_not_flat() -> None:
    """Schema mismatch 회귀 보호 (Gemini review-r2 CRITICAL fix):

    aggregator 는 flat output 이지만 DailyTotalsSchema 는 micronutrients 를 nested
    dict 로 기대 (packages/shared-types/src/jsonb/index.ts). `_round_totals` 가
    reshape — macros 4-7 top-level + 18 micros nested `micronutrients` 키.
    """
    pool: List[RecipeSlot] = [
        RecipeSlot(
            recipe_id="r0",
            meal_type="lunch",
            allergens=[],
            ingredients=[],
            nutrition={
                "calories": 500,
                "protein_g": 30,
                "carbs_g": 50,
                "fat_g": 15,
                "fiber_g": 8,
                "sodium_mg": 400,
                # 18 micronutrient flat (PR-A USDA backfill 형식)
                "vitamin_c_mg": 60,
                "calcium_mg": 200,
                "iron_mg": 4,
            },
        ),
    ]
    inputs = _baseline_inputs()
    inputs["base_diet"] = {"recipes": list(pool)}
    inputs["candidate_pool"] = pool

    result = await run_pipeline(**inputs)
    day0 = result["weekly_plan"][0]
    totals = day0["daily_totals"]

    # macros + fiber_g/sodium_mg 는 top-level
    assert totals["calories"] == 500.0
    assert totals["protein_g"] == 30.0
    assert totals["fiber_g"] == 8.0
    assert totals["sodium_mg"] == 400.0

    # 18 micronutrient 는 nested dict
    assert "micronutrients" in totals
    micros = totals["micronutrients"]
    assert micros["vitamin_c_mg"] == 60.0
    assert micros["calcium_mg"] == 200.0
    assert micros["iron_mg"] == 4.0

    # vitamin/iron 등은 top-level 에 노출되지 않아야 함 (schema 정합성)
    assert "vitamin_c_mg" not in totals
    assert "iron_mg" not in totals
