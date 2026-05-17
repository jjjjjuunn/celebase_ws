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

# IMPL-MEAL-P1-GOAL-PACE-001: weight_loss/muscle_gain 의 사용자 선택 속도.
# Aragon AA et al., J Int Soc Sports Nutr 2017;14:16 (deficit consensus 20~25%);
# Slater GJ et al., Sports Med 2019;49(Suppl 2):103-12 (lean bulking 5~15%).
# moderate 는 기존 GOAL_FACTORS 값과 일치 — 기존 호출부 backward-compat.
# aggressive surplus 는 보수적 default 1.20 (Slater 권장 상한 15% 인접). 25% surplus
# unlock 은 후속 chore (CHORE-MEAL-AGGRESSIVE-PROTEIN-SAFEGUARDS — protein 2.0g/kg
# 자동 강화 + Mobile FE 경고 UI + LBM tracking) 완료 후.
GOAL_PACE_MULTIPLIERS: dict[str, dict[str, float]] = {
    "weight_loss": {"slow": 0.90, "moderate": 0.80, "aggressive": 0.75},
    "muscle_gain": {"slow": 1.05, "moderate": 1.15, "aggressive": 1.20},
}
_DEFAULT_GOAL_PACE = "moderate"

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
    goal_pace: str = _DEFAULT_GOAL_PACE,
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

    factor = _goal_factor(
        primary_goal.strip().lower(),
        activity_level.strip().lower(),
        goal_pace.strip().lower(),
    )
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


def _goal_factor(primary_goal: str, activity_level: str, goal_pace: str) -> float:
    """Return the TDEE multiplier for the given goal, activity, and pace.

    IMPL-MEAL-P1-GOAL-PACE-001: weight_loss/muscle_gain 은 goal_pace 분기 우선.
    maintenance/glp1_support/athletic_performance 는 goal_pace 무시 (기존 동작).
    """
    pace_map = GOAL_PACE_MULTIPLIERS.get(primary_goal)
    if pace_map is not None:
        pace_key = goal_pace if goal_pace in pace_map else _DEFAULT_GOAL_PACE
        if pace_key != goal_pace:
            _logger.warning(
                "Unknown goal_pace %r — defaulting to %s", goal_pace, _DEFAULT_GOAL_PACE
            )
        return pace_map[pace_key]

    if primary_goal not in GOAL_FACTORS:
        _logger.warning(
            "Unknown primary_goal %r — defaulting to maintenance factor (1.0)",
            primary_goal,
        )

    base = GOAL_FACTORS.get(primary_goal, 1.0)

    if primary_goal == "athletic_performance" and activity_level == "very_active":
        return _ATHLETIC_VERY_ACTIVE_FACTOR

    return base
