"""Variety optimiser — spec.md §5.3 Step 5."""

from __future__ import annotations

import logging
import random
from collections import Counter
from typing import List

from .allergen_filter import RecipeSlot  # re-use dataclass for consistency

__all__ = [
    "optimize_variety",
    "count_recipe_repeats",
]

_logger = logging.getLogger(__name__)


MAX_RECIPE_REPEATS = 2  # 7-day window

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
) -> List[List[RecipeSlot]]:
    """Ensure no recipe appears more than :data:`MAX_RECIPE_REPEATS` times."""

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
            options = [c for c in pool_by_type.get(slot.meal_type, []) if c.recipe_id not in used_ids]
            if options:
                substitute = random.choice(options)
                new_day.append(substitute)
                used_ids.add(substitute.recipe_id)
                current_counts[substitute.recipe_id] += 1
                current_counts[slot.recipe_id] -= 1
                replacements += 1
            else:
                _logger.warning("Variety optimiser exhausted candidates for %s", slot.meal_type)
                new_day.append(slot)
        updated_plan.append(new_day)

    _logger.info("Variety optimiser performed %d replacements", replacements)
    return updated_plan

