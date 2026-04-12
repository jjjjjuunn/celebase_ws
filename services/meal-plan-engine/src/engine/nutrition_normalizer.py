"""Nutrition data normaliser — spec.md §5.5."""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from typing import Dict, Final, List

__all__ = [
    "NutritionStandard",
    "normalize",
    "compare_sources",
]

_logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


UNIT_CONVERSIONS: Final[dict[tuple[str, str], float]] = {
    ("IU", "µg"): 1 / 40,
    ("µg", "IU"): 40,
    ("mg", "µg"): 1000,
    ("µg", "mg"): 0.001,
}

PROTEIN_VARIANCE_WARN_PCT: Final[float] = 5.0
CALORIE_DRIFT_WARN_PCT: Final[float] = 10.0


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class NutritionStandard:
    source: str
    source_version: str
    calories_kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    sugar_g: float
    sodium_mg: float
    micronutrients: Dict[str, Dict[str, float | str]]  # value/unit/confidence

    def asdict(self) -> dict:  # helper for debug / serialisation
        return asdict(self)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def normalize(raw: dict, source: str, source_version: str = "unknown") -> NutritionStandard:  # noqa: C901
    """Normalise *raw* nutrition dict into the canonical :class:`NutritionStandard`."""

    # Base scalar fields may vary in naming; map fallbacks.
    calories = raw.get("calories_kcal", raw.get("calories", 0.0))
    protein = raw.get("protein_g", raw.get("protein", 0.0))
    carbs = raw.get("carbs_g", raw.get("carbohydrates_g", 0.0))
    fat = raw.get("fat_g", raw.get("fat", 0.0))
    fiber = raw.get("fiber_g", raw.get("fiber", 0.0))
    sugar = raw.get("sugar_g", raw.get("sugar", 0.0))
    sodium = raw.get("sodium_mg", raw.get("sodium", 0.0))

    micronutrients_in = raw.get("micronutrients", {})
    micronutrients_out: Dict[str, Dict[str, float | str]] = {}

    for name, entry in micronutrients_in.items():
        # Entry may be a scalar, tuple or dict.  Normalise to dict w/ value+unit.
        if isinstance(entry, (int, float)):
            value = float(entry)
            unit = "mg" if name.endswith("_mg") else ("µg" if name.endswith("_ug") else "unknown")
            confidence = 1.0
        elif isinstance(entry, dict):
            value = float(entry.get("value", 0.0))
            unit = str(entry.get("unit", "unknown"))
            confidence = float(entry.get("confidence", 1.0))
        else:
            _logger.warning("Unsupported micronutrient entry format for %s: %r", name, entry)
            continue

        # Convert unit if needed.
        target_unit = "µg" if unit in {"IU", "µg"} else unit  # vitamin D path; others keep same.
        conv_key = (unit, target_unit)
        if unit == "IU":
            confidence = 0.9  # Spec mandates confidence downgrade.

        factor = UNIT_CONVERSIONS.get(conv_key, 1.0)
        value_converted = value * factor

        micronutrients_out[name] = {
            "value": round(value_converted, 2),
            "unit": target_unit,
            "confidence": round(confidence, 2),
        }

    return NutritionStandard(
        source=source,
        source_version=source_version,
        calories_kcal=float(calories),
        protein_g=float(protein),
        carbs_g=float(carbs),
        fat_g=float(fat),
        fiber_g=float(fiber),
        sugar_g=float(sugar),
        sodium_mg=float(sodium),
        micronutrients=micronutrients_out,
    )


def compare_sources(a: NutritionStandard, b: NutritionStandard) -> dict:
    """Compare two :class:`NutritionStandard` objects and detect large variances."""

    def _variance_pct(x: float, y: float) -> float:
        if x == y == 0:
            return 0.0
        avg = (x + y) / 2 or 1  # avoid division by zero
        return abs(x - y) / avg * 100.0

    protein_var = _variance_pct(a.protein_g, b.protein_g)
    calorie_var = _variance_pct(a.calories_kcal, b.calories_kcal)

    warnings: List[str] = []
    if protein_var > PROTEIN_VARIANCE_WARN_PCT:
        warnings.append("protein_variance_exceeds_threshold")
    if calorie_var > CALORIE_DRIFT_WARN_PCT:
        warnings.append("calorie_drift_exceeds_threshold")

    return {
        "protein_variance_pct": round(protein_var, 2),
        "calorie_variance_pct": round(calorie_var, 2),
        "warnings": warnings,
    }

