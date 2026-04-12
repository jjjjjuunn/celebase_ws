"""CelebBase Meal Plan Engine — Engine package.

This package contains the *leaf* algorithmic modules that make up the
personalisation pipeline implemented in **spec.md §5.3–§5.7**.

Modules exported via ``__all__`` can be imported directly, e.g.::

    from src.engine.calorie_adjuster import adjust_calories

The actual orchestration logic that combines these modules lives in
``engine/pipeline.py`` which is implemented in IMPL-004-c.
"""

# Re-export public symbols for convenience so that static analysers &
# IDEs can discover them easily.

__all__: list[str] = [
    "adjust_calories",
    "rebalance_macros",
    "filter_allergens",
    "count_allergen_conflicts",
    "check_micronutrients",
    "MicronutrientReport",
    "optimize_variety",
    "count_recipe_repeats",
    "normalize",
    "compare_sources",
    "NutritionStandard",
    "minimize_profile",
    "get_allowed_fields",
    # Dataclasses exposed by sub-modules
    "RecipeSlot",
]

# NOTE: The real implementations live in sibling modules that are imported
# lazily by consumers. Importing them here would introduce avoidable import
# time cost and circular import risk, so we purposefully do **not** import
# the implementation symbols at module import time.

