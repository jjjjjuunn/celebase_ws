"""Nutrition aggregator — spec.md §5.3 Step 4 (inline loop 대체).

책임 분리:
  - nutrition_normalizer.normalize() — 단일 dict 단위 정규화 (단위 변환)
  - nutrition_aggregator.aggregate_*() — 다중 RecipeSlot 단순 합산 (정규화된 값 전제)

P0.3 / P0.4 prerequisite.
"""

from __future__ import annotations

import logging
from typing import Dict, List

from .allergen_filter import RecipeSlot

__all__ = ["aggregate_day", "aggregate_week", "KNOWN_MICRO_KEYS"]

_logger = logging.getLogger(__name__)

# USDA FDC 백필 + NIH ODS RDA 기준 18 micronutrient + macros (PR-A 시리즈 + PR-B1).
# nutrition_per_100g 의 flat key set — aggregator 가 인식하는 영양소 키 목록.
# 이 set 외 키는 합산하되 warn log (forward-compat).
KNOWN_MICRO_KEYS: frozenset[str] = frozenset(
    {
        # macros (RecipeSlot.nutrition top-level)
        "calories",
        "protein_g",
        "carbs_g",
        "fat_g",
        "fiber_g",
        "sugar_g",
        "sodium_mg",
        # 18 micronutrient (PR-B1 RDA dict 와 1:1 매칭 — micronutrient_checker.RDA)
        "vitamin_a_ug_rae",
        "vitamin_c_mg",
        "vitamin_d_ug",
        "vitamin_e_mg",
        "vitamin_k_ug",
        "vitamin_b6_mg",
        "vitamin_b12_ug",
        "folate_ug_dfe",
        "calcium_mg",
        "iron_mg",
        "magnesium_mg",
        "zinc_mg",
        "potassium_mg",
        "phosphorus_mg",
        "selenium_ug",
        "iodine_ug",
        "omega3_g",
    }
)


def _extract_flat_nutrition(slot: RecipeSlot) -> Dict[str, float]:
    """RecipeSlot.nutrition (macros + nested `micronutrients` dict) → flat dict.

    nutrition 형식 (USDA backfill 결과):
      {
        "calories": 380,
        "protein_g": 28,
        ...,
        "micronutrients": {"vitamin_b12_ug": 1.2, ...}   # optional nested
      }

    또는 이미 flat 한 dict 도 지원 (PR-A2 backfill 의 단순 매핑).

    결측 / None / non-numeric 값은 warn 로그 + skip.
    """
    nutr = slot.nutrition or {}
    result: Dict[str, float] = {}

    for k, v in nutr.items():
        if k == "micronutrients" and isinstance(v, dict):
            # nested micronutrients dict — flatten
            for mk, mv in v.items():
                if mv is None:
                    _logger.warning(
                        "aggregator: None micronutrient recipe=%s key=%s",
                        slot.recipe_id,
                        mk,
                    )
                    continue
                if isinstance(mv, (int, float)):
                    result[mk] = float(mv)
                elif isinstance(mv, dict) and "value" in mv:
                    # {value, unit, confidence} rich object 도 지원 (forward-compat)
                    val = mv.get("value")
                    if isinstance(val, (int, float)):
                        result[mk] = float(val)
                    elif val is None:
                        _logger.warning(
                            "aggregator: None micronutrient value recipe=%s key=%s",
                            slot.recipe_id,
                            mk,
                        )
                    else:
                        _logger.warning(
                            "aggregator: non-numeric micronutrient value recipe=%s key=%s type=%s",
                            slot.recipe_id,
                            mk,
                            type(val).__name__,
                        )
                else:
                    _logger.warning(
                        "aggregator: unrecognised micro format recipe=%s key=%s",
                        slot.recipe_id,
                        mk,
                    )
        elif v is None:
            _logger.warning(
                "aggregator: None value recipe=%s key=%s",
                slot.recipe_id,
                k,
            )
        elif isinstance(v, (int, float)):
            result[k] = float(v)
        else:
            _logger.warning(
                "aggregator: non-numeric value recipe=%s key=%s type=%s",
                slot.recipe_id,
                k,
                type(v).__name__,
            )
    return result


def aggregate_day(slots: List[RecipeSlot]) -> Dict[str, float]:
    """하루치 모든 slot 의 영양소 합산.

    Args:
        slots: 하루치 meal slot list (보통 4: breakfast / lunch / dinner / snack).

    Returns:
        flat dict {nutrient_key: total_value}. Empty slots → empty dict.
    """
    totals: Dict[str, float] = {}
    unknown_keys_logged: set[str] = set()
    for slot in slots:
        flattened = _extract_flat_nutrition(slot)
        for key, value in flattened.items():
            totals[key] = totals.get(key, 0.0) + value
            if key not in KNOWN_MICRO_KEYS and key not in unknown_keys_logged:
                _logger.warning(
                    "aggregator: unknown nutrient key recipe=%s key=%s",
                    slot.recipe_id,
                    key,
                )
                unknown_keys_logged.add(key)
    return totals


def aggregate_week(weekly_plan: List[List[RecipeSlot]]) -> List[Dict[str, float]]:
    """7일 plan → 일별 totals list (check_weekly_avg 입력 형식).

    Args:
        weekly_plan: List[Day] where Day = List[RecipeSlot].

    Returns:
        List[per-day-totals]. Length == len(weekly_plan).
    """
    return [aggregate_day(day_slots) for day_slots in weekly_plan]
