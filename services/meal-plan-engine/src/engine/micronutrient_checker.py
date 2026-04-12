"""Micronutrient adequacy checker — spec.md §5.3 Step 4."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Dict, Final

__all__ = [
    "RDA",
    "MicronutrientReport",
    "check_micronutrients",
]

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Recommended Dietary Allowance (simplified adult values).
RDA: Final[dict[str, float]] = {
    "vitamin_c_mg": 90.0,
    "vitamin_d_ug": 15.0,
    "calcium_mg": 1000.0,
    "iron_mg": 8.0,
    "fiber_g": 25.0,
    "potassium_mg": 3500.0,
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
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def check_micronutrients(daily_totals: dict[str, float]) -> MicronutrientReport:  # noqa: C901
    """Compare *daily_totals* against :data:`RDA` and return a report."""

    compliance_pct: dict[str, float] = {}
    deficient: list[str] = []
    supplement_suggestions: list[str] = []

    for nutrient, target in RDA.items():
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

