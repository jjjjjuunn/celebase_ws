"""IMPL-APP-005-a contract + nutrition regression tests.

Contract: GET /meal-plans/{id} response shape per IMPL-APP-005 plan v0.2.1.
Regression: _build_candidate_pool propagates nutrition field (G1 fix).
"""

from __future__ import annotations

import pytest

from src.routes.meal_plans import _serialize_meal_plan_row


# ---------------------------------------------------------------------------
# Serializer contract tests
# ---------------------------------------------------------------------------


def _llm_row() -> dict:
    return {
        "id": "01907f00-0000-7000-8000-000000000001",
        "status": "completed",
        "start_date": None,
        "end_date": None,
        "created_at": None,
        "updated_at": None,
        "adjustments": {
            "mode": "llm",
            "target_kcal": 2000.0,
            "macros": {"protein_g": 150, "carb_g": 250, "fat_g": 67},
            "llm_provenance": {"model": "gpt-4o", "tokens_used": 1024},
        },
        "daily_plans": [
            {
                "date": "2026-04-24",
                "meals": [
                    {
                        "meal_type": "breakfast",
                        "recipe_id": "r-uuid-001",
                        "narrative": "Ronaldo의 경기 전 탄수화물 루틴에서 영감을 받은 오트밀입니다.",
                        "citations": [
                            {
                                "source_type": "celebrity_interview",
                                "title": "GQ 2023 Ronaldo Interview",
                                "url": None,
                                "celeb_persona": "ronaldo",
                            }
                        ],
                    }
                ],
            }
        ],
    }


def _standard_row() -> dict:
    return {
        "id": "01907f00-0000-7000-8000-000000000002",
        "status": "completed",
        "start_date": None,
        "end_date": None,
        "created_at": None,
        "updated_at": None,
        "adjustments": {
            "mode": "standard",
            "target_kcal": 2000.0,
        },
        "daily_plans": [
            {
                "date": "2026-04-24",
                "meals": [
                    {
                        "meal_type": "breakfast",
                        "recipe_id": "r-uuid-001",
                        "narrative": None,
                        "citations": [],
                    }
                ],
            }
        ],
    }


class TestSerializeMealPlanRow:
    def test_mode_llm_top_level_canonical(self) -> None:
        result = _serialize_meal_plan_row(_llm_row())
        assert result["mode"] == "llm"

    def test_mode_llm_exposes_narrative(self) -> None:
        result = _serialize_meal_plan_row(_llm_row())
        meal = result["daily_plans"][0]["meals"][0]
        assert (
            meal["narrative"]
            == "Ronaldo의 경기 전 탄수화물 루틴에서 영감을 받은 오트밀입니다."
        )

    def test_mode_llm_exposes_citations(self) -> None:
        result = _serialize_meal_plan_row(_llm_row())
        meal = result["daily_plans"][0]["meals"][0]
        assert len(meal["citations"]) == 1
        assert meal["citations"][0]["source_type"] == "celebrity_interview"

    def test_mode_llm_excludes_llm_provenance(self) -> None:
        result = _serialize_meal_plan_row(_llm_row())
        assert "llm_provenance" not in result

    def test_mode_standard_top_level_canonical(self) -> None:
        result = _serialize_meal_plan_row(_standard_row())
        assert result["mode"] == "standard"

    def test_mode_standard_nullifies_narrative(self) -> None:
        result = _serialize_meal_plan_row(_standard_row())
        meal = result["daily_plans"][0]["meals"][0]
        assert meal["narrative"] is None

    def test_mode_standard_empty_citations(self) -> None:
        result = _serialize_meal_plan_row(_standard_row())
        meal = result["daily_plans"][0]["meals"][0]
        assert meal["citations"] == []

    def test_mode_standard_excludes_llm_provenance(self) -> None:
        result = _serialize_meal_plan_row(_standard_row())
        assert "llm_provenance" not in result

    def test_adjustments_missing_defaults_to_standard(self) -> None:
        row = {**_standard_row(), "adjustments": None}
        result = _serialize_meal_plan_row(row)
        assert result["mode"] == "standard"

    def test_daily_plans_none_returns_empty_list(self) -> None:
        row = {**_standard_row(), "daily_plans": None}
        result = _serialize_meal_plan_row(row)
        assert result["daily_plans"] == []


# ---------------------------------------------------------------------------
# Nutrition regression test (G1 fix)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_candidate_pool_propagates_nutrition() -> None:
    """RecipeSlot.nutrition must carry through from the recipe dict (G1 fix)."""
    from src.consumers.sqs_consumer import _build_candidate_pool

    recipes = [
        {
            "id": "r-001",
            "meal_type": "breakfast",
            "allergens": [],
            "ingredients": ["oats", "milk"],
            "nutrition": {"calories_kcal": 400.0, "protein_g": 15.0},
        },
        {
            "id": "r-002",
            "meal_type": "lunch",
            "allergens": ["gluten"],
            "ingredients": ["pasta"],
            "nutrition": None,
        },
    ]
    slots = await _build_candidate_pool(recipes)

    assert len(slots) == 2
    assert slots[0].nutrition == {"calories_kcal": 400.0, "protein_g": 15.0}
    assert slots[1].nutrition is None
