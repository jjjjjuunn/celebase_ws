"""Allergen wiring regression (CHORE-ALLERGEN-VOCAB-001).

Locks the Phase 0 fix: allergies must be sourced from the stored bio_profile
(via phi_minimizer "allergen_filter"), not only from meal_plans.preferences.
Before the fix, mobile-generated plans passed empty preferences.allergies and
bio_profile.allergies never reached filter_allergens — so the allergen filter
(and the fail-closed llm_safety gate) were a no-op.
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import patch

import pytest

from src.engine.allergen_filter import RecipeSlot
from src.engine.llm_schema import LlmProvenance, LlmRerankResult
from src.engine.pipeline import _union_lists, run_pipeline


def _mk_slot(rid: str, meal: str = "lunch") -> RecipeSlot:
    return RecipeSlot(recipe_id=rid, meal_type=meal, allergens=[], ingredients=[])


@pytest.fixture(autouse=True)
def _disable_ilp_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("src.engine.pipeline.settings.PIPELINE_USE_ILP", False)
    yield


def _inputs(bio_profile: Dict[str, Any], preferences: Dict[str, Any]) -> Dict[str, Any]:
    pool: List[RecipeSlot] = [_mk_slot(f"r{i}") for i in range(3)]
    return {
        "plan_id": "plan-allergen",
        "base_diet": {"recipes": list(pool)},
        "bio_profile": bio_profile,
        "preferences": preferences,
        "candidate_pool": pool,
        "duration_days": 3,
        "on_progress": lambda _p: None,
    }


@pytest.mark.asyncio
async def test_allergies_sourced_from_bio_profile_when_preferences_empty() -> None:
    """bio_profile.allergies must reach filter_allergens even with empty preferences."""
    captured: Dict[str, Any] = {}

    def _spy(recipes, allergies, intolerances, pool):  # type: ignore[no-untyped-def]
        # Record the first (pass-1) invocation's user allergen args.
        captured.setdefault("allergies", allergies)
        captured.setdefault("intolerances", intolerances)
        return recipes

    bio = {
        "weight_kg": 70,
        "activity_level": "moderate",
        "tdee": 2200,
        "primary_goal": "maintenance",
        "allergies": ["dairy"],
        "intolerances": ["soy"],
    }
    with patch("src.engine.pipeline.filter_allergens", side_effect=_spy):
        await run_pipeline(**_inputs(bio, {"allergies": [], "intolerances": []}))

    assert captured["allergies"] == ["dairy"]
    assert captured["intolerances"] == ["soy"]


@pytest.mark.asyncio
async def test_bio_profile_and_preferences_allergies_are_unioned() -> None:
    """Legacy preferences.allergies still contribute, unioned + de-duped."""
    captured: Dict[str, Any] = {}

    def _spy(recipes, allergies, intolerances, pool):  # type: ignore[no-untyped-def]
        captured.setdefault("allergies", allergies)
        return recipes

    bio = {
        "weight_kg": 70,
        "activity_level": "moderate",
        "tdee": 2200,
        "primary_goal": "maintenance",
        "allergies": ["dairy", "peanuts"],
    }
    with patch("src.engine.pipeline.filter_allergens", side_effect=_spy):
        await run_pipeline(**_inputs(bio, {"allergies": ["peanuts", "gluten"]}))

    # bio first (order preserved), legacy preferences appended, "peanuts" de-duped.
    assert captured["allergies"] == ["dairy", "peanuts", "gluten"]


@pytest.mark.asyncio
async def test_llm_safety_gate_receives_allergies_and_intolerances() -> None:
    """The LLM reranker can swap in any pool recipe, so the fail-closed gate must
    enforce allergies AND intolerances (the same blocked set filter_allergens uses)."""
    bio = {
        "weight_kg": 70,
        "activity_level": "moderate",
        "tdee": 2200,
        "primary_goal": "maintenance",
        "allergies": ["dairy"],
        "intolerances": ["soy"],
    }
    inputs = _inputs(bio, {"allergies": [], "intolerances": []})
    provenance = LlmProvenance(
        model="gpt-4.1-mini", prompt_hash="a" * 16, output_hash="b" * 16, mode="llm"
    )
    fake_result = LlmRerankResult(
        ranked_plan=[[inputs["candidate_pool"][0]]] * inputs["duration_days"],
        mode="llm",
        provenance=provenance,
        quota_exceeded=False,
    )
    with (
        patch("src.engine.pipeline.settings.ENABLE_LLM_MEAL_PLANNER", True),
        patch(
            "src.engine.pipeline.llm_rerank_and_narrate", return_value=fake_result
        ) as mock_llm,
    ):
        await run_pipeline(
            **inputs,
            redis_client=object(),
            llm_context={"persona_id": "p1", "user_id_hash": "h1"},
        )

    passed = mock_llm.call_args.kwargs["user_allergies"]
    assert "dairy" in passed and "soy" in passed


def test_union_lists_dedupes_preserves_order_and_ignores_non_lists() -> None:
    assert _union_lists(["dairy", "peanuts"], ["peanuts", "gluten"]) == [
        "dairy",
        "peanuts",
        "gluten",
    ]
    assert _union_lists(None, ["dairy"]) == ["dairy"]
    assert _union_lists(["dairy"], None, "not-a-list") == ["dairy"]
    assert _union_lists([1, "dairy", None], ["dairy"]) == ["dairy"]  # type: ignore[list-item]
    assert _union_lists() == []
