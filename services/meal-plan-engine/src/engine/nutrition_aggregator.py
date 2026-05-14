"""Nutrition aggregator — spec.md §5.3 Step 4 (inline loop 대체).

책임 분리:
  - nutrition_normalizer.normalize() — 단일 dict 단위 정규화 (단위 변환)
  - nutrition_aggregator.aggregate_*() — 다중 RecipeSlot 단순 합산 (정규화된 값 전제)

P0.3 / P0.4 prerequisite.
"""

from __future__ import annotations

import logging
import math
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


def _coerce_finite(value: object) -> float | None:
    """int/float 만 float 으로 변환. NaN/Infinity/bool/기타 타입은 None 반환.

    NaN < MIN_COMPLIANCE 가 False 를 반환하여 micronutrient_checker 의 결핍 검출이
    silent false-positive (충족) 로 오판되는 데이터 무결성 사고를 방지한다.
    bool 은 int 의 subclass 이지만 영양값으로 부적절하므로 명시적 거부.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        f = float(value)
        if math.isfinite(f):
            return f
    return None


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

    NaN / Infinity / non-numeric / None 값은 per-recipe 1 회 요약 warn 후 skip
    (로그 스팸 방지: 4 meal × 18 nutrient 최악 케이스 72 줄 → 4 줄로 축소).
    """
    nutr = slot.nutrition or {}
    result: Dict[str, float] = {}
    rejected_keys: list[str] = []

    def _accept(key: str, raw: object) -> None:
        coerced = _coerce_finite(raw)
        if coerced is None:
            rejected_keys.append(key)
            return
        result[key] = coerced

    for k, v in nutr.items():
        if k == "micronutrients" and isinstance(v, dict):
            for mk, mv in v.items():
                if isinstance(mv, dict) and "value" in mv:
                    # {value, unit, confidence} rich object — value 만 추출.
                    # unit 검증은 nutrition_normalizer 책임 (Plan §Task 3 책임 경계).
                    _accept(mk, mv.get("value"))
                else:
                    _accept(mk, mv)
        else:
            _accept(k, v)

    if rejected_keys:
        _logger.warning(
            "aggregator: rejected non-finite/non-numeric values recipe=%s count=%d keys=%s",
            slot.recipe_id,
            len(rejected_keys),
            ",".join(sorted(set(rejected_keys))[:10]),
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
