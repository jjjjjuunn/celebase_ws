"""Pipeline orchestrator — spec.md §5.2 & §5.6.

This module stitches together the seven leaf-modules implemented in the
``src.engine`` package and exposes a single public coroutine
:func:`run_pipeline`.  The function follows the *Two-Pass* workflow defined in
spec §5.6:

Pass 1 (quick draft)
--------------------
1. Calorie adjustment – very fast, deterministic
2. Allergen filter     – leverages cached candidate pool

Pass 1 provides an initial "good-enough" draft so the UI can render a skeleton
within ~3 seconds.

Pass 2 (deep optimisation)
--------------------------
Runs the full 7-stage pipeline:
1. PHI minimisation per stage
2. Calorie adjuster                 ``adjust_calories``
3. Macro rebalance                  ``rebalance_macros``
4. Allergen filter                  ``filter_allergens``
5. Micronutrient checker            ``check_micronutrients``
6. Variety optimiser                ``optimize_variety``
7. Nutrition data normalisation     ``normalize``

The *on_progress* callback receives JSON-serialisable dicts so the WebSocket
layer can relay real-time status updates to subscribed clients.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List

from . import calorie_adjuster, macro_rebalancer, micronutrient_checker, nutrition_normalizer, phi_minimizer, variety_optimizer
from .allergen_filter import RecipeSlot, filter_allergens

__all__ = ["run_pipeline"]

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _emit(on_progress: Callable[[Dict[str, Any]], None], payload: Dict[str, Any]) -> None:  # noqa: D401
    """Safety wrapper that shields *on_progress* exceptions from the engine."""

    try:
        maybe_awaitable = on_progress(payload)
        if asyncio.iscoroutine(maybe_awaitable):
            await maybe_awaitable
    except Exception:  # noqa: BLE001 – never let WS progress crash the engine
        _logger.exception("on_progress callback raised – ignoring to keep pipeline alive")


def _build_weekly_plan(
    safe_recipes: List[RecipeSlot],
    duration_days: int,
) -> List[List[RecipeSlot]]:
    """Group allergen-safe recipes by meal_type and round-robin across days.

    Returns a duration_days-long list of per-day meal slots. Deterministic
    ordering (input order preserved) keeps the pipeline reproducible for
    tests and for the downstream variety optimiser to reason about.
    """

    by_type: Dict[str, List[RecipeSlot]] = {}
    for slot in safe_recipes:
        by_type.setdefault(slot.meal_type, []).append(slot)

    meal_types = ("breakfast", "lunch", "dinner", "snack")
    plan: List[List[RecipeSlot]] = []
    for day_idx in range(duration_days):
        day_slots: List[RecipeSlot] = []
        for mt in meal_types:
            pool = by_type.get(mt, [])
            if pool:
                day_slots.append(pool[day_idx % len(pool)])
        plan.append(day_slots)
    return plan


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def run_pipeline(  # noqa: C901 – orchestration wrapper is inherently long
    plan_id: str,
    base_diet: Dict[str, Any],
    bio_profile: Dict[str, Any],
    preferences: Dict[str, Any],
    candidate_pool: List[RecipeSlot],
    duration_days: int,
    on_progress: Callable[[Dict[str, Any]], None] | Callable[[Dict[str, Any]], Any],
) -> Dict[str, Any]:
    """Generate a personalised meal-plan using the Two-Pass strategy.

    All inputs are assumed to be *trusted* by virtue of coming from internal
    services that already enforce Zod/Pydantic validation.  Nevertheless, the
    :pymod:`src.engine.phi_minimizer` is used to strip any fields that are not
    strictly required by a given leaf-module in order to minimise the surface
    area of PHI exposure (spec §5.7).
    """

    # ---------------------------------------------------------------------
    # Pass 1 – lightning draft (steps 1 & 4)
    # ---------------------------------------------------------------------

    await _emit(on_progress, {"pass": 1, "pct": 0})

    # --- 1a. Calorie target ------------------------------------------------
    prof_cal = phi_minimizer.minimize_profile(bio_profile, "calorie_adjustment")
    tdee = prof_cal.get("tdee", preferences.get("tdee", 2000))  # fallback heuristic
    primary_goal = prof_cal.get("primary_goal", preferences.get("primary_goal", "maintenance"))
    activity_level = prof_cal.get("activity_level", "moderate")

    target_kcal = calorie_adjuster.adjust_calories(tdee, primary_goal, activity_level)

    await _emit(on_progress, {"pass": 1, "pct": 30})

    # --- 1b. Allergen filter ---------------------------------------------
    user_allergies = preferences.get("allergies", [])
    user_intolerances = preferences.get("intolerances", [])
    draft_recipes = filter_allergens(base_diet.get("recipes", []), user_allergies, user_intolerances, candidate_pool)  # type: ignore[arg-type]

    await _emit(on_progress, {"pass": 1, "pct": 100})

    # draft_out available for Pass 1 early-return if needed in future
    _ = {"plan_id": plan_id, "status": "draft", "target_kcal": target_kcal}

    # ---------------------------------------------------------------------
    # Pass 2 – deep optimisation (full stack)
    # ---------------------------------------------------------------------

    await _emit(on_progress, {"pass": 2, "pct": 0})

    # Step 2 – Macro rebalance
    prof_macro = phi_minimizer.minimize_profile(bio_profile, "macro_rebalance")

    macros = macro_rebalancer.rebalance_macros(
        target_kcal=target_kcal,
        weight_kg=prof_macro.get("weight_kg", 70.0),
        activity_level=prof_macro.get("activity_level", "moderate"),
        primary_goal=primary_goal,
        fat_ratio=preferences.get("fat_ratio", 0.35),
        diet_type=prof_macro.get("diet_type", "balanced"),
    )

    await _emit(on_progress, {"pass": 2, "pct": 25})

    # Step 3 – Allergen (already applied in pass 1 but re-run against updated pool)
    safe_recipes = filter_allergens(draft_recipes, user_allergies, user_intolerances, candidate_pool)

    await _emit(on_progress, {"pass": 2, "pct": 35})

    # Step 4 – Micronutrient adequacy (simplified – aggregate per-recipe nutrition)
    daily_totals: Dict[str, float] = {}
    for slot in safe_recipes:
        # Assume each slot has nutrition dict for simplification purposes.
        nutr = getattr(slot, "nutrition", {})  # type: ignore[attr-defined]
        for k, v in nutr.items():
            daily_totals[k] = daily_totals.get(k, 0.0) + float(v)

    micro_report = micronutrient_checker.check_micronutrients(daily_totals)

    await _emit(on_progress, {"pass": 2, "pct": 55})

    # Step 5 – Variety optimiser (weekly plan)
    weekly_plan = _build_weekly_plan(safe_recipes, duration_days)
    if weekly_plan and any(day for day in weekly_plan):
        varied_plan = variety_optimizer.optimize_variety(weekly_plan, candidate_pool)
    else:
        varied_plan = []

    await _emit(on_progress, {"pass": 2, "pct": 70})

    # Step 6 – Nutrition normalisation
    nutrition_std = nutrition_normalizer.normalize(
        {
            "calories_kcal": target_kcal,
            "protein_g": macros["protein_g"],
            "carbs_g": macros["carb_g"],
            "fat_g": macros["fat_g"],
            "micronutrients": daily_totals,
        },
        source="engine_pipeline",
    )

    await _emit(on_progress, {"pass": 2, "pct": 95})

    # Final assemble -------------------------------------------------------
    final_out: Dict[str, Any] = {
        "plan_id": plan_id,
        "status": "completed",
        "target_kcal": target_kcal,
        "macros": macros,
        "micronutrient_report": micro_report.__dict__,
        "nutrition_standard": nutrition_std.asdict(),
        "weekly_plan": [[slot.recipe_id for slot in day] for day in varied_plan],
    }

    await _emit(on_progress, {"pass": 2, "pct": 100})

    return final_out
