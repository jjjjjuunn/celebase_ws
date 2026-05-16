"""Variety optimiser — spec.md §5.3 Step 5."""

# fallback_only — IMPL-MEAL-P0-ILP-001 (PR-D2) 이후 primary path 는 plan_solver.build_meal_plan.
# 본 모듈은 ILP timeout / infeasible / model_invalid 시 graceful fallback 으로만 호출됨.

from __future__ import annotations

import logging
import random
from collections import Counter
from typing import List, Optional

from .allergen_filter import RecipeSlot  # re-use dataclass for consistency

__all__ = [
    "optimize_variety",
    "count_recipe_repeats",
]

_logger = logging.getLogger(__name__)


MAX_RECIPE_REPEATS = 2  # 7-day window
_DEFAULT_RNG_SEED = (
    42  # ILP_RANDOM_SEED 와 일치 — 결정성 fail-safe (Gemini r1 HIGH #2 fix)
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def count_recipe_repeats(weekly_plan: List[List[RecipeSlot]]) -> dict[str, int]:
    """Return a mapping of recipe_id → appearance count."""

    return Counter(slot.recipe_id for day in weekly_plan for slot in day)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def optimize_variety(
    weekly_plan: List[List[RecipeSlot]],
    candidate_pool: List[RecipeSlot],
    rng: Optional[random.Random] = None,
) -> List[List[RecipeSlot]]:
    """Ensure no recipe appears more than :data:`MAX_RECIPE_REPEATS` times.

    rng 주입 시 deterministic substitute 선택 — 미주입 시 seed=42 (ILP_RANDOM_SEED 매칭)
    로 fail-safe deterministic. CI flaky test 방지 (Gemini r1 HIGH #2 fix).
    """

    if rng is None:
        rng = random.Random(_DEFAULT_RNG_SEED)
    current_counts = count_recipe_repeats(weekly_plan)

    # Index candidate pool by meal_type for quick look-ups, track used IDs.
    pool_by_type: dict[str, list[RecipeSlot]] = {}
    for c in candidate_pool:
        pool_by_type.setdefault(c.meal_type, []).append(c)

    used_ids: set[str] = {slot.recipe_id for day in weekly_plan for slot in day}

    updated_plan: list[list[RecipeSlot]] = []
    replacements = 0

    for day_slots in weekly_plan:
        new_day: list[RecipeSlot] = []
        for slot in day_slots:
            if current_counts[slot.recipe_id] <= MAX_RECIPE_REPEATS:
                new_day.append(slot)
                continue

            # Need replacement.
            options = [
                c
                for c in pool_by_type.get(slot.meal_type, [])
                if c.recipe_id not in used_ids
            ]
            if options:
                substitute = rng.choice(options)
                new_day.append(substitute)
                used_ids.add(substitute.recipe_id)
                current_counts[substitute.recipe_id] += 1
                current_counts[slot.recipe_id] -= 1
                replacements += 1
            else:
                _logger.warning(
                    "Variety optimiser exhausted candidates for %s", slot.meal_type
                )
                new_day.append(slot)
        updated_plan.append(new_day)

    _logger.info("Variety optimiser performed %d replacements", replacements)
    return updated_plan
