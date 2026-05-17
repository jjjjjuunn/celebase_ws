"""PHI minimization module — spec.md §5.7, §5.8."""

from typing import Literal

PipelineTask = Literal[
    "calorie_adjustment", "macro_rebalance", "allergen_filter", "glp1_adjustment"
]

TASK_FIELD_MAP: dict[str, list[str]] = {
    "calorie_adjustment": [
        "weight_kg",
        "height_cm",
        "activity_level",
        "primary_goal",
        "goal_pace",  # IMPL-MEAL-P1-GOAL-PACE-001
        "tdee_kcal",
        "target_kcal",
    ],
    "macro_rebalance": [
        "weight_kg",
        "activity_level",
        "diet_type",
        "medications",
        "goal_pace",  # CHORE-MEAL-AGGRESSIVE-PROTEIN-001: aggressive cut → protein 2.0g/kg
    ],
    "allergen_filter": ["allergies", "intolerances"],
    "glp1_adjustment": ["weight_kg", "primary_goal"],
}


def minimize_profile(full_profile: dict, task: str) -> dict:
    """Extract only the fields required for the given pipeline task.

    Unknown task returns empty dict (fail-safe — never returns full profile).
    """
    allowed = TASK_FIELD_MAP.get(task, [])
    return {k: full_profile[k] for k in allowed if k in full_profile}


def get_allowed_fields(task: str) -> list[str]:
    """Return the list of allowed fields for a task (helper for tests)."""
    return list(TASK_FIELD_MAP.get(task, []))
