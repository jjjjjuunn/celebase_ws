"""Macro rebalance module — spec.md §5.3 Step 2.

Calculates daily *protein*, *fat* and *carbohydrate* gram targets from a
calorie budget, body-weight and lifestyle factors.

The implementation is a direct translation of the algorithm defined in
spec §5.3 Step 2 while enforcing the nutrition bounds mirrored from
.claude/rules/domain/ai-engine.md.
"""

from __future__ import annotations

import logging
from typing import Final

__all__ = ["rebalance_macros"]

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ACTIVITY_BASE: Final[dict[str, float]] = {
    "sedentary": 1.2,
    "light": 1.4,
    "moderate": 1.6,
    "active": 1.8,
    "very_active": 2.0,
}

GOAL_MINIMUM: Final[dict[str, float]] = {
    "weight_loss": 1.4,
    "muscle_gain": 2.2,
    "glp1_support": 2.2,
    "athletic_performance": 2.0,
    "maintenance": 0.0,
}

PROTEIN_BOUNDS: Final[tuple[float, float]] = (0.8, 3.0)  # g/kg

# NUTRITION_BOUNDS["min_carb_g"] (see domain rules)
_MIN_CARB_G: Final[int] = 50


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def rebalance_macros(
    target_kcal: int,
    weight_kg: float,
    activity_level: str,
    primary_goal: str,
    fat_ratio: float,
    diet_type: str = "balanced",
) -> dict[str, float]:
    """Compute macro gram targets and return them in a dict.

    Returns
    -------
    dict
        ``{"protein_g", "fat_g", "carb_g", "protein_multiplier"}``
    """

    # Sanity checks — fail fast on obviously invalid input.
    if target_kcal <= 0:
        raise ValueError("target_kcal must be positive")
    if weight_kg <= 0:
        raise ValueError("weight_kg must be positive")
    if not (0.0 <= fat_ratio <= 1.0):
        raise ValueError("fat_ratio must be within [0.0, 1.0]")

    activity_key = activity_level.strip().lower()
    goal_key = primary_goal.strip().lower()

    base_mult = ACTIVITY_BASE.get(activity_key)
    if base_mult is None:
        _logger.warning("Unknown activity_level %r → defaulting to 'moderate'", activity_level)
        base_mult = ACTIVITY_BASE["moderate"]

    goal_min = GOAL_MINIMUM.get(goal_key)
    if goal_min is None:
        _logger.warning("Unknown primary_goal %r → assuming 'maintenance'", primary_goal)
        goal_min = GOAL_MINIMUM["maintenance"]

    # Step 1 & 2 — select effective multiplier then clamp to bounds.
    effective = max(base_mult, goal_min)
    effective = max(PROTEIN_BOUNDS[0], min(PROTEIN_BOUNDS[1], effective))

    protein_g = weight_kg * effective

    remaining_kcal = target_kcal - protein_g * 4
    if remaining_kcal <= 0:
        # Extremely low-calorie scenario: allocate entire budget to protein.
        _logger.warning(
            "Protein calories exceed budget (%d kcal) — returning protein-only macros",
            target_kcal,
        )
        return {
            "protein_g": round(protein_g, 1),
            "fat_g": 0.0,
            "carb_g": 0.0,
            "protein_multiplier": round(effective, 2),
        }

    fat_kcal = remaining_kcal * fat_ratio
    carb_kcal = remaining_kcal - fat_kcal  # conservation of energy

    fat_g = fat_kcal / 9
    carb_g = carb_kcal / 4

    # Enforce minimum carbohydrate grams.
    if carb_g < _MIN_CARB_G:
        adjustment = _MIN_CARB_G - carb_g
        carb_g = _MIN_CARB_G
        fat_kcal = max(0.0, remaining_kcal - carb_g * 4)
        fat_g = fat_kcal / 9 if fat_kcal else 0.0
        _logger.info("Raised carbs by %.1f g to satisfy minimum", adjustment)

    return {
        "protein_g": round(protein_g, 1),
        "fat_g": round(fat_g, 1),
        "carb_g": round(carb_g, 1),
        "protein_multiplier": round(effective, 2),
    }

