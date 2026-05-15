"""Plan solver tests — IMPL-MEAL-P0-ILP-001-a (P0.4-a)."""

from __future__ import annotations

import time
from typing import Any

import pytest

from src.engine.allergen_filter import RecipeSlot
from src.engine.plan_solver import (
    DEFAULT_WEIGHTS,
    ILPInfeasibleError,
    ILPModelError,
    build_meal_plan,
)


def _make_slot(rid: str, meal_type: str, nutrition: dict[str, float]) -> RecipeSlot:
    return RecipeSlot(
        recipe_id=rid,
        meal_type=meal_type,
        allergens=[],
        ingredients=[],
        nutrition=nutrition,
    )


def _balanced_pool(size_per_type: int = 6) -> list[RecipeSlot]:
    """기본 풀 — 각 meal_type 당 size_per_type 개, 영양 적절히 분배."""
    pool: list[RecipeSlot] = []
    nutr_by_type = {
        "breakfast": {"calories": 400, "protein_g": 25, "carbs_g": 50, "fat_g": 12},
        "lunch": {"calories": 600, "protein_g": 40, "carbs_g": 70, "fat_g": 18},
        "dinner": {"calories": 700, "protein_g": 45, "carbs_g": 80, "fat_g": 22},
        "snack": {"calories": 200, "protein_g": 8, "carbs_g": 30, "fat_g": 5},
    }
    for meal_type, nutr in nutr_by_type.items():
        for index in range(size_per_type):
            pool.append(_make_slot(f"{meal_type}-{index}", meal_type, nutr))
    return pool


def test_basic_7day_plan() -> None:
    """가용 풀로 7일 plan 결정 — kcal band ± 100 + protein ≥ 95% 만족."""
    pool = _balanced_pool(size_per_type=6)
    plan = build_meal_plan(
        candidate_pool=pool,
        target_kcal=1900,
        macros={"protein_g": 118, "carbs_g": 230, "fat_g": 57},
        duration_days=7,
    )
    assert len(plan) == 7
    for day in plan:
        total_kcal = sum(slot.nutrition["calories"] for slot in day)
        total_protein = sum(slot.nutrition["protein_g"] for slot in day)
        assert 1800 <= total_kcal <= 2000, f"kcal band {total_kcal} out of [1800, 2000]"
        assert total_protein >= 118 * 0.95, f"protein {total_protein} < 95% of 118"


def test_forbidden_ids_excluded() -> None:
    """forbidden_ids 의 recipe 가 plan 에 등장하지 않음."""
    pool = _balanced_pool(size_per_type=6)
    forbidden = {"breakfast-0", "lunch-0", "dinner-0"}
    plan = build_meal_plan(
        candidate_pool=pool,
        target_kcal=1900,
        macros={"protein_g": 118, "carbs_g": 230, "fat_g": 57},
        duration_days=7,
        forbidden_ids=forbidden,
    )
    selected_ids = {slot.recipe_id for day in plan for slot in day}
    assert not (forbidden & selected_ids), (
        f"forbidden leaked: {forbidden & selected_ids}"
    )


def test_max_repeats_enforced() -> None:
    """max_repeats=2 — 어떤 recipe 도 전체 plan 에서 2 회 초과 등장 X."""
    pool = _balanced_pool(size_per_type=6)
    plan = build_meal_plan(
        candidate_pool=pool,
        target_kcal=1900,
        macros={"protein_g": 118, "carbs_g": 230, "fat_g": 57},
        duration_days=7,
        max_repeats=2,
    )
    counts: dict[str, int] = {}
    for day in plan:
        for slot in day:
            counts[slot.recipe_id] = counts.get(slot.recipe_id, 0) + 1
    for recipe_id, count in counts.items():
        assert count <= 2, f"recipe {recipe_id} 등장 {count}회 > max_repeats=2"


def test_infeasible_raises() -> None:
    """pool 이 너무 작아 max_repeats 만족 불가 → ILPInfeasibleError."""
    pool = [
        _make_slot(
            "only-bf",
            "breakfast",
            {"calories": 400, "protein_g": 25, "carbs_g": 50, "fat_g": 12},
        ),
        _make_slot(
            "only-l",
            "lunch",
            {"calories": 600, "protein_g": 40, "carbs_g": 70, "fat_g": 18},
        ),
        _make_slot(
            "only-d",
            "dinner",
            {"calories": 700, "protein_g": 45, "carbs_g": 80, "fat_g": 22},
        ),
    ]
    with pytest.raises(ILPInfeasibleError):
        build_meal_plan(
            candidate_pool=pool,
            target_kcal=1700,
            macros={"protein_g": 110, "carbs_g": 200, "fat_g": 52},
            duration_days=7,
            max_repeats=2,
        )


def test_performance_pool_200_under_10s() -> None:
    """pool 200 + 7 day plan — time_limit=10s 내 완료."""
    pool = _balanced_pool(size_per_type=50)
    start = time.perf_counter()
    plan = build_meal_plan(
        candidate_pool=pool,
        target_kcal=1900,
        macros={"protein_g": 118, "carbs_g": 230, "fat_g": 57},
        duration_days=7,
        time_limit_sec=10.0,
    )
    elapsed = time.perf_counter() - start
    assert len(plan) == 7
    assert elapsed < 10.0, f"solver took {elapsed:.2f}s > 10s budget"


def test_determinism_same_input_same_output() -> None:
    """동일 input 2 회 호출 → 동일 output (random_seed=42, num_workers=1)."""
    pool = _balanced_pool(size_per_type=6)
    args: dict[str, Any] = {
        "candidate_pool": pool,
        "target_kcal": 1900,
        "macros": {"protein_g": 118, "carbs_g": 230, "fat_g": 57},
        "duration_days": 7,
        "random_seed": 42,
    }
    plan_a = build_meal_plan(**args)
    plan_b = build_meal_plan(**args)
    ids_a = [[slot.recipe_id for slot in day] for day in plan_a]
    ids_b = [[slot.recipe_id for slot in day] for day in plan_b]
    assert ids_a == ids_b, "determinism violation"


def test_default_weights_exposed() -> None:
    """DEFAULT_WEIGHTS 는 key 4 개 보장."""
    assert set(DEFAULT_WEIGHTS) == {"kcal", "protein", "macro", "variety"}


def test_target_kcal_below_nutrition_bounds_rejected() -> None:
    """NUTRITION_BOUNDS.min_daily_kcal=1200 미만 target → ValueError.

    Gemini r1 CRITICAL #1 fix 회귀 보호. ai-engine.md 의무.
    """
    pool = _balanced_pool(size_per_type=6)
    with pytest.raises(ValueError, match="NUTRITION_BOUNDS"):
        build_meal_plan(
            candidate_pool=pool,
            target_kcal=1000,  # 1200 미만
            macros={"protein_g": 80, "carbs_g": 120, "fat_g": 30},
            duration_days=7,
        )


def test_target_kcal_above_nutrition_bounds_rejected() -> None:
    """NUTRITION_BOUNDS.max_daily_kcal=5000 초과 target → ValueError."""
    pool = _balanced_pool(size_per_type=6)
    with pytest.raises(ValueError, match="NUTRITION_BOUNDS"):
        build_meal_plan(
            candidate_pool=pool,
            target_kcal=5500,  # 5000 초과
            macros={"protein_g": 200, "carbs_g": 600, "fat_g": 150},
            duration_days=7,
        )


def test_ilp_model_error_class_exported() -> None:
    """ILPModelError class export 검증 (Gemini r1 MEDIUM #2 fix).

    MODEL_INVALID 분기는 실제 trigger 가 어려우므로 (보호 코드) class export 만 검증.
    """
    assert issubclass(ILPModelError, Exception)
    assert ILPModelError is not ILPInfeasibleError
    # name conflict check: 세 예외 클래스 모두 distinct
    from src.engine.plan_solver import ILPTimeoutError

    assert len({ILPInfeasibleError, ILPTimeoutError, ILPModelError}) == 3
