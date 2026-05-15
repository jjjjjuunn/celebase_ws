"""AI engine end-to-end scenarios (IMPL-004-c).

The tests focus on nutritional logic implemented by individual leaf-modules.
They avoid hitting external services by constructing deterministic inputs and
verifying invariant guarantees defined in *ai-engine.md* (§ test scenarios).
"""

from __future__ import annotations

from typing import List

import math

import pytest

from src.engine import (
    calorie_adjuster,
    macro_rebalancer,
    allergen_filter,
    variety_optimizer,
    nutrition_normalizer,
)
from src.engine.allergen_filter import RecipeSlot, count_allergen_conflicts
from src.engine.pipeline import _build_weekly_plan, run_pipeline


# ---------------------------------------------------------------------------
# Helper fixtures -----------------------------------------------------------
# ---------------------------------------------------------------------------


def _mk_slot(rid: str, meal: str, allergens: List[str] | None = None) -> RecipeSlot:  # noqa: D401
    return RecipeSlot(
        recipe_id=rid,
        meal_type=meal,
        allergens=allergens or [],
        ingredients=[],
    )


# ---------------------------------------------------------------------------
# 1. 기본 생성 (Ronaldo diet archetype) -------------------------------------
# ---------------------------------------------------------------------------


def test_basic_generation_calories_and_macros():  # noqa: D401
    tdee = 2500  # kcal
    kcal = calorie_adjuster.adjust_calories(
        tdee, primary_goal="maintenance", activity_level="moderate"
    )
    assert 2000 <= kcal <= 2800, "Calorie target outside healthy range"

    macros = macro_rebalancer.rebalance_macros(
        target_kcal=kcal,
        weight_kg=80.0,
        activity_level="moderate",
        primary_goal="maintenance",
        fat_ratio=0.3,
    )
    assert 120 <= macros["protein_g"] <= 200, "Protein out of expected bounds"


# ---------------------------------------------------------------------------
# 2. 알레르기 대체 ----------------------------------------------------------
# ---------------------------------------------------------------------------


def test_allergen_substitution():  # noqa: D401
    recipes = [
        _mk_slot("r_cheese_1", "lunch", ["dairy"]),
        _mk_slot("r_gluten_1", "dinner", ["gluten"]),
    ]
    pool = [
        _mk_slot("safe_salad", "lunch"),
        _mk_slot("safe_stirfry", "dinner"),
    ]

    filtered = allergen_filter.filter_allergens(recipes, ["dairy"], ["gluten"], pool)
    assert count_allergen_conflicts(filtered, ["dairy", "gluten"]) == 0


# ---------------------------------------------------------------------------
# 3. 극단적 감량 ------------------------------------------------------------
# ---------------------------------------------------------------------------


def test_extreme_weight_loss_calorie_floor():  # noqa: D401
    kcal = calorie_adjuster.adjust_calories(
        1400, primary_goal="weight_loss", activity_level="sedentary"
    )
    assert kcal >= 1200  # safety clamp


# ---------------------------------------------------------------------------
# 4. 고활동량 ---------------------------------------------------------------
# ---------------------------------------------------------------------------


def test_high_activity_protein_multiplier():  # noqa: D401
    macros = macro_rebalancer.rebalance_macros(
        target_kcal=3200,
        weight_kg=90,
        activity_level="very_active",
        primary_goal="muscle_gain",
        fat_ratio=0.25,
    )
    assert macros["protein_g"] >= 90 * 2.0  # >= body-weight × 2.0g


# ---------------------------------------------------------------------------
# 5. GLP-1 모드 -------------------------------------------------------------
# ---------------------------------------------------------------------------


def test_glp1_support_deficit_and_protein():  # noqa: D401
    base_tdee = 2200
    kcal = calorie_adjuster.adjust_calories(base_tdee, primary_goal="glp1_support")
    assert math.isclose(kcal, base_tdee * 0.9, abs_tol=1), "Should be 10% deficit"

    macros = macro_rebalancer.rebalance_macros(
        target_kcal=kcal,
        weight_kg=85,
        activity_level="light",
        primary_goal="glp1_support",
        fat_ratio=0.3,
    )
    assert macros["protein_g"] >= 85 * 2.0


# ---------------------------------------------------------------------------
# 6. 비건 단백질 ------------------------------------------------------------
# ---------------------------------------------------------------------------


def test_vegan_high_protein_macros():  # noqa: D401
    macros = macro_rebalancer.rebalance_macros(
        target_kcal=2600,
        weight_kg=75,
        activity_level="active",
        primary_goal="muscle_gain",
        fat_ratio=0.25,
        diet_type="vegan",
    )
    assert macros["protein_g"] >= 150  # plant-only but still high protein


# ---------------------------------------------------------------------------
# 7. 7일 다양성 -------------------------------------------------------------
# ---------------------------------------------------------------------------


def test_variety_optimizer_no_triple_repeats():  # noqa: D401
    # Build a weekly plan with 3 repeats of the same recipe (invalid)
    repeats = [_mk_slot("r1", "dinner") for _ in range(3)] + [_mk_slot("r2", "dinner")]
    week = [repeats] * 7  # every day identical list reference – okay for test

    pool = [_mk_slot(f"candidate_{i}", "dinner") for i in range(200)]

    optimised = variety_optimizer.optimize_variety(week, pool)
    counts = variety_optimizer.count_recipe_repeats(optimised)
    assert all(v <= 2 for v in counts.values()), "Recipe repeated more than twice"


# ---------------------------------------------------------------------------
# 8. 영양소 단위 변환 --------------------------------------------------------
# ---------------------------------------------------------------------------


def test_vitamin_d_unit_conversion():  # noqa: D401
    raw = {
        "calories": 100,
        "micronutrients": {
            "vitamin_d_ug": {"value": 5, "unit": "µg"},
            "vitamin_d_IU": {"value": 200, "unit": "IU"},
        },
    }
    norm = nutrition_normalizer.normalize(raw, source="usda")
    d_ug = norm.micronutrients["vitamin_d_ug"]["value"]
    d_iu = norm.micronutrients["vitamin_d_IU"]["value"] * (
        40 if norm.micronutrients["vitamin_d_IU"]["unit"] == "µg" else 1
    )
    assert math.isclose(d_ug * 40, d_iu, rel_tol=0.01)


# ---------------------------------------------------------------------------
# 9. PHI 최소화 -------------------------------------------------------------
# ---------------------------------------------------------------------------


def test_phi_minimizer_fields():  # noqa: D401
    from src.engine.phi_minimizer import minimize_profile, get_allowed_fields

    full = {
        "weight_kg": 70,
        "height_cm": 175,
        "activity_level": "moderate",
        "primary_goal": "maintenance",
        "ssn": "123-45-6789",  # should be stripped
    }
    subset = minimize_profile(full, "calorie_adjustment")
    allowed = set(get_allowed_fields("calorie_adjustment"))
    assert set(subset.keys()) <= allowed


# ---------------------------------------------------------------------------
# 10. Pipeline integration (IMPL-014-c) -------------------------------------
# ---------------------------------------------------------------------------


def test_build_weekly_plan_respects_duration_days():  # noqa: D401
    pool = [_mk_slot(f"r{i}", "lunch") for i in range(3)]
    plan = _build_weekly_plan(pool, duration_days=5)
    assert len(plan) == 5
    # Round-robin: day 0→r0, day 1→r1, day 2→r2, day 3→r0, day 4→r1
    assert [day[0].recipe_id for day in plan] == ["r0", "r1", "r2", "r0", "r1"]


def test_build_weekly_plan_mixed_meal_types():  # noqa: D401
    pool = [
        _mk_slot("b1", "breakfast"),
        _mk_slot("l1", "lunch"),
        _mk_slot("d1", "dinner"),
    ]
    plan = _build_weekly_plan(pool, duration_days=2)
    assert len(plan) == 2
    assert [s.recipe_id for s in plan[0]] == ["b1", "l1", "d1"]
    assert [s.recipe_id for s in plan[1]] == ["b1", "l1", "d1"]


def test_build_weekly_plan_empty_pool_returns_empty_days():  # noqa: D401
    plan = _build_weekly_plan([], duration_days=3)
    assert plan == [[], [], []]


@pytest.mark.asyncio
async def test_run_pipeline_produces_weekly_plan_of_duration_length():  # noqa: D401
    candidate_pool = [_mk_slot(f"r{i}", "lunch") for i in range(4)]
    base_diet = {"recipes": list(candidate_pool)}
    bio_profile = {
        "weight_kg": 70,
        "activity_level": "moderate",
        "tdee": 2200,
        "primary_goal": "maintenance",
    }
    preferences = {"allergies": [], "intolerances": []}

    events: list[dict] = []

    async def _cb(payload: dict) -> None:
        events.append(payload)

    result = await run_pipeline(
        plan_id="plan-test",
        base_diet=base_diet,
        bio_profile=bio_profile,
        preferences=preferences,
        candidate_pool=candidate_pool,
        duration_days=7,
        on_progress=_cb,
    )

    assert result["status"] == "completed"
    assert len(result["weekly_plan"]) == 7
    # Progress events fired in expected order.
    # IMPL-MEAL-P0-DAILY-001-a: Pass1 의 3 emit → 1 emit (pct:100) 로 축소.
    assert events[0] == {"pass": 1, "pct": 100}
    assert events[-1] == {"pass": 2, "pct": 100}


@pytest.mark.asyncio
async def test_run_pipeline_duration_three_produces_three_days():  # noqa: D401
    candidate_pool = [_mk_slot(f"r{i}", "lunch") for i in range(2)]
    base_diet = {"recipes": list(candidate_pool)}
    bio_profile = {
        "weight_kg": 60,
        "activity_level": "sedentary",
        "tdee": 1800,
        "primary_goal": "weight_loss",
    }
    preferences = {"allergies": [], "intolerances": []}

    result = await run_pipeline(
        plan_id="plan-short",
        base_diet=base_diet,
        bio_profile=bio_profile,
        preferences=preferences,
        candidate_pool=candidate_pool,
        duration_days=3,
        on_progress=lambda _p: None,
    )
    assert len(result["weekly_plan"]) == 3
