"""Calorie adjustment module — spec.md §5.3 Step 1.

Computes a user's daily calorie target as TDEE × goal_factor,
clamped to the safety bounds defined in .claude/rules/domain/ai-engine.md.
"""

import logging
import math

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GOAL_FACTORS: dict[str, float] = {
    "weight_loss": 0.80,
    "muscle_gain": 1.15,
    "maintenance": 1.00,
    "glp1_support": 0.90,
    "athletic_performance": 1.10,  # overridden to 1.25 for very_active
}

# Special-case: athletic_performance + very_active
_ATHLETIC_VERY_ACTIVE_FACTOR = 1.25

MIN_KCAL = 1200
MAX_KCAL = 5000


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def adjust_calories(
    tdee: float,
    primary_goal: str,
    activity_level: str = "moderate",
) -> int:
    """Return the goal-adjusted daily calorie target clamped to [1200, 5000].

    Parameters
    ----------
    tdee:
        Total Daily Energy Expenditure in kcal (must be > 0).
    primary_goal:
        One of the keys of ``GOAL_FACTORS``.  Unknown values default to
        factor 1.0 (maintenance) and a warning is logged.
    activity_level:
        Activity level label.  Only ``"very_active"`` changes the
        *athletic_performance* factor from 1.10 → 1.25.

    Returns
    -------
    int
        Calorie target (kcal), rounded half-away-from-zero, clamped to
        ``[MIN_KCAL, MAX_KCAL]``.
    """
    if tdee <= 0:
        raise ValueError(f"TDEE must be positive, got {tdee}")

    factor = _goal_factor(primary_goal.strip().lower(), activity_level.strip().lower())
    raw = tdee * factor

    # Python's built-in round() uses banker's rounding; use floor(x + 0.5)
    # for the traditional half-away-from-zero behaviour.
    target = int(math.floor(raw + 0.5))
    clamped = max(MIN_KCAL, min(MAX_KCAL, target))

    if clamped != target:
        _logger.warning(
            "Calorie target %d kcal clamped to %d kcal (bounds [%d, %d])",
            target,
            clamped,
            MIN_KCAL,
            MAX_KCAL,
        )

    return clamped


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _goal_factor(primary_goal: str, activity_level: str) -> float:
    """Return the TDEE multiplier for the given goal and activity level."""
    if primary_goal not in GOAL_FACTORS:
        _logger.warning(
            "Unknown primary_goal %r — defaulting to maintenance factor (1.0)",
            primary_goal,
        )

    base = GOAL_FACTORS.get(primary_goal, 1.0)

    if primary_goal == "athletic_performance" and activity_level == "very_active":
        return _ATHLETIC_VERY_ACTIVE_FACTOR

    return base
