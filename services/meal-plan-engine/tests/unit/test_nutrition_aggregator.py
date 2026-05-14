from __future__ import annotations

from src.engine.allergen_filter import RecipeSlot
from src.engine.nutrition_aggregator import (
    KNOWN_MICRO_KEYS,
    aggregate_day,
    aggregate_week,
)


def _make_slot(rid: str, nutrition: dict | None) -> RecipeSlot:
    return RecipeSlot(
        recipe_id=rid,
        meal_type="lunch",
        allergens=[],
        ingredients=[],
        nutrition=nutrition,
    )


def test_aggregate_day_empty_slots() -> None:
    """Empty list → empty dict."""
    assert aggregate_day([]) == {}


def test_aggregate_day_none_nutrition_skipped() -> None:
    """slot.nutrition = None 인 slot 은 무시, 다른 slot 만 합산."""
    slots = [
        _make_slot("r1", None),
        _make_slot("r2", {"calories": 300, "protein_g": 20}),
    ]
    result = aggregate_day(slots)
    assert result == {"calories": 300.0, "protein_g": 20.0}


def test_aggregate_day_nested_micronutrients_flattened() -> None:
    """nested micronutrients dict 가 flat key 로 전개."""
    nutr = {
        "calories": 400,
        "protein_g": 25,
        "micronutrients": {
            "vitamin_c_mg": 20.0,
            "vitamin_b12_ug": 1.5,
            "iron_mg": 3.0,
        },
    }
    result = aggregate_day([_make_slot("r1", nutr)])
    assert result["calories"] == 400.0
    assert result["protein_g"] == 25.0
    assert result["vitamin_c_mg"] == 20.0
    assert result["vitamin_b12_ug"] == 1.5
    assert result["iron_mg"] == 3.0


def test_aggregate_day_multiple_slots_sum() -> None:
    """여러 slot 의 동일 nutrient key 합산 정확성."""
    slots = [
        _make_slot("r1", {"calories": 300, "protein_g": 20, "fiber_g": 5}),
        _make_slot("r2", {"calories": 500, "protein_g": 30, "fiber_g": 8}),
        _make_slot("r3", {"calories": 200, "fiber_g": 3}),
    ]
    result = aggregate_day(slots)
    assert result["calories"] == 1000.0
    assert result["protein_g"] == 50.0
    assert result["fiber_g"] == 16.0


def test_aggregate_week_7_days() -> None:
    """7일 plan → 7 entries, 각 day 독립 합산."""
    week = [[_make_slot(f"r{d}-1", {"calories": 500 + d * 10})] for d in range(7)]
    result = aggregate_week(week)
    assert len(result) == 7
    assert result[0]["calories"] == 500.0
    assert result[3]["calories"] == 530.0
    assert result[6]["calories"] == 560.0


def test_aggregate_day_rich_micronutrient_format() -> None:
    """forward-compat: {value, unit, confidence} 객체 형식도 value 추출."""
    nutr = {
        "calories": 400,
        "micronutrients": {
            "vitamin_b12_ug": {"value": 2.0, "unit": "ug", "confidence": 0.95},
            "iron_mg": {"value": 4.0},
        },
    }
    result = aggregate_day([_make_slot("r1", nutr)])
    assert result["vitamin_b12_ug"] == 2.0
    assert result["iron_mg"] == 4.0


def test_known_micro_keys_size() -> None:
    """KNOWN_MICRO_KEYS sanity: 7 macros + 18 micros − 1 (fiber_g 중복) = 24.

    fiber_g 는 macros (calories/protein/carbs/fat/fiber/sugar/sodium) + RDA micros
    양쪽에 정의되어 frozenset deduplication 으로 1 keys 차감 (24).
    """
    assert len(KNOWN_MICRO_KEYS) == 24
    assert "calories" in KNOWN_MICRO_KEYS
    assert "fiber_g" in KNOWN_MICRO_KEYS
    assert "vitamin_b12_ug" in KNOWN_MICRO_KEYS
    assert "omega3_g" in KNOWN_MICRO_KEYS
    assert "potassium_mg" in KNOWN_MICRO_KEYS
