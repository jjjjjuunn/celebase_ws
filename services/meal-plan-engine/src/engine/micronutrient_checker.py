
"""Micronutrient adequacy checker — spec.md §5.3 Step 4."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Final, List, Literal

__all__ = [
    "RDA",
    "_RDA_FEMALE_OVERRIDES",
    "MicronutrientReport",
    "check_micronutrients",
    "check_weekly_avg",
]

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# RDA values from NIH Office of Dietary Supplements (DRI, adult 19-50)
# https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx
# adult male baseline; female overrides in _RDA_FEMALE_OVERRIDES below.
RDA: Final[dict[str, float]] = {
    "vitamin_c_mg": 90.0,
    "vitamin_d_ug": 15.0,
    "calcium_mg": 1000.0,
    "iron_mg": 8.0,
    "fiber_g": 25.0,
    "potassium_mg": 3400.0,
    "vitamin_a_ug_rae": 900.0,
    "vitamin_e_mg": 15.0,
    "vitamin_k_ug": 120.0,
    "vitamin_b6_mg": 1.3,
    "vitamin_b12_ug": 2.4,
    "folate_ug_dfe": 400.0,
    "magnesium_mg": 420.0,
    "zinc_mg": 11.0,
    "omega3_g": 1.6,
    "phosphorus_mg": 700.0,
    "selenium_ug": 55.0,
    "iodine_ug": 150.0,
}

# Female overrides (NIH ODS adult 19-50 female values differing from male baseline).
# Sources:
#   - Iron / Vit A / Vit K / Mg / Zn / omega-3: NIH ODS factsheets
#   - Vit C: female 75 mg (NIH ODS Vit C HP factsheet)
#   - Potassium: female 2600 mg (NASEM 2019 DRI for Sodium and Potassium)
_RDA_FEMALE_OVERRIDES: Final[dict[str, float]] = {
    "iron_mg": 18.0,
    "vitamin_a_ug_rae": 700.0,
    "vitamin_c_mg": 75.0,
    "vitamin_k_ug": 90.0,
    "magnesium_mg": 320.0,
    "zinc_mg": 8.0,
    "omega3_g": 1.1,
    "potassium_mg": 2600.0,
}

MIN_COMPLIANCE: Final[float] = 0.70  # 70 %


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class MicronutrientReport:
    """Report object returned by :func:`check_micronutrients`."""

    compliant: bool
    deficient: List[str]
    compliance_pct: Dict[str, float]
    supplement_suggestions: List[str]


# Simple mapping from nutrient key → supplement suggestion label.
_SUPPLEMENTS: Final[dict[str, str]] = {
    "vitamin_c_mg": "Vitamin C supplement",
    "vitamin_d_ug": "Vitamin D supplement",
    "calcium_mg": "Calcium supplement",
    "iron_mg": "Iron supplement",
    "fiber_g": "Fiber supplement",
    "potassium_mg": "Potassium supplement",
    "vitamin_a_ug_rae": "Vitamin A supplement",
    "vitamin_e_mg": "Vitamin E supplement",
    "vitamin_k_ug": "Vitamin K supplement",
    "vitamin_b6_mg": "Vitamin B6 supplement",
    "vitamin_b12_ug": "Vitamin B12 supplement",
    "folate_ug_dfe": "Folate supplement",
    "magnesium_mg": "Magnesium supplement",
    "zinc_mg": "Zinc supplement",
    "omega3_g": "Omega-3 (algae or fish oil) supplement",
    "phosphorus_mg": "Phosphorus supplement",
    "selenium_ug": "Selenium supplement",
    "iodine_ug": "Iodine supplement",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def check_micronutrients(
    daily_totals: dict[str, float],
    sex: Literal["male", "female", "unisex"] = "unisex",
) -> MicronutrientReport:  # noqa: C901
    """Compare *daily_totals* against :data:`RDA` and return a report.

    Args:
        daily_totals: Per-day aggregated nutrient totals (per nutrient key).
        sex: "male" / "female" / "unisex" (default). When "female", applies
            _RDA_FEMALE_OVERRIDES on top of base RDA. "unisex" uses male
            baseline (보수적 — 남성 RDA가 female RDA와 같거나 더 높은 영양소
            대부분이기 때문).
    """

    rda: dict[str, float] = dict(RDA)
    if sex == "female":
        rda.update(_RDA_FEMALE_OVERRIDES)

    compliance_pct: dict[str, float] = {}
    deficient: list[str] = []
    supplement_suggestions: list[str] = []

    for nutrient, target in rda.items():
        actual = daily_totals.get(nutrient, 0.0)
        ratio = 0.0 if target == 0 else actual / target
        compliance_pct[nutrient] = round(ratio, 2)

        if ratio < MIN_COMPLIANCE:
            deficient.append(nutrient)
            suggestion = _SUPPLEMENTS.get(nutrient)
            if suggestion:
                supplement_suggestions.append(suggestion)

    compliant = len(deficient) == 0

    if not compliant:
        _logger.info("Micronutrient deficiencies detected: %s", deficient)

    return MicronutrientReport(
        compliant=compliant,
        deficient=deficient,
        compliance_pct=compliance_pct,
        supplement_suggestions=supplement_suggestions,
    )


def check_weekly_avg(
    weekly_totals: list[dict[str, float]],
    sex: Literal["male", "female", "unisex"] = "unisex",
) -> MicronutrientReport:
    """Average 7-day totals then delegate to :func:`check_micronutrients`.

    임상 기준: 주 평균이 RDA의 70% 이상이어야 결핍으로 간주하지 않는다.

    Args:
        weekly_totals: List of per-day nutrient totals dicts.
        sex: Same semantics as :func:`check_micronutrients`.

    Returns:
        MicronutrientReport computed from averaged nutrient totals.
    """

    if not weekly_totals:
        return check_micronutrients({}, sex=sex)

    avg: dict[str, float] = {}
    n = len(weekly_totals)
    for day in weekly_totals:
        for nutrient, value in day.items():
            avg[nutrient] = avg.get(nutrient, 0.0) + (value / n)

    return check_micronutrients(avg, sex=sex)

