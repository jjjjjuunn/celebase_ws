"""Allergen filter module — spec.md §5.3 Step 3.

Filters user-blocked allergens/intolerances from a list of *RecipeSlot*s and
replaces offending recipes with safe alternatives.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from typing import List, Set

__all__ = [
    "RecipeSlot",
    "filter_allergens",
    "count_allergen_conflicts",
]

_logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class RecipeSlot:
    """Represents a planned recipe for a specific meal slot."""

    recipe_id: str
    meal_type: str  # breakfast / lunch / dinner / snack
    allergens: List[str]
    ingredients: List[str]


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def filter_allergens(
    recipes: List[RecipeSlot],
    user_allergies: List[str],
    user_intolerances: List[str],
    candidate_pool: List[RecipeSlot],
) -> List[RecipeSlot]:
    """Return *recipes* with all blocked allergens removed or substituted.

    The function never mutates the input lists; it always produces new
    *RecipeSlot* instances so the caller can safely compare before/after.
    """

    blocked: Set[str] = {a.lower() for a in user_allergies + user_intolerances}

    def _is_safe(slot: RecipeSlot) -> bool:
        return not blocked.intersection(a.lower() for a in slot.allergens)

    # Build a lookup of candidate recipes by meal_type that are safe.
    pool_by_type: dict[str, list[RecipeSlot]] = {}
    for c in candidate_pool:
        if _is_safe(c):
            pool_by_type.setdefault(c.meal_type, []).append(c)

    filtered: list[RecipeSlot] = []
    replacements = 0
    for slot in recipes:
        if _is_safe(slot):
            filtered.append(slot)
            continue

        # Need replacement.
        safe_options = pool_by_type.get(slot.meal_type, [])
        if safe_options:
            substitute = random.choice(safe_options)
            filtered.append(substitute)
        else:
            # Graceful degradation placeholder.
            placeholder = RecipeSlot(
                recipe_id="UNAVAILABLE",
                meal_type=slot.meal_type,
                allergens=[],
                ingredients=[],
            )
            filtered.append(placeholder)
        replacements += 1

    _logger.info("%d recipes replaced due to allergen conflicts", replacements)
    return filtered


def count_allergen_conflicts(recipes: List[RecipeSlot], blocked: List[str]) -> int:
    """Return the number of recipes that contain any of *blocked* allergens."""

    blocked_set = {a.lower() for a in blocked}
    return sum(1 for r in recipes if blocked_set.intersection(a.lower() for a in r.allergens))

