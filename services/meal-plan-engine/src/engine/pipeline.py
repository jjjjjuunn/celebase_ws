"""Pipeline orchestrator — spec.md §5.2, §5.6, §5.8.

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
Runs the full 8-stage pipeline:
1. PHI minimisation per stage
2. Calorie adjuster                 ``adjust_calories``
3. Macro rebalance                  ``rebalance_macros``
4. Allergen filter                  ``filter_allergens``
5. Micronutrient checker            ``check_micronutrients``
6. Variety optimiser                ``optimize_variety``
6.5 LLM Reranker + Narrator        ``llm_rerank_and_narrate``  (optional)
7. Nutrition data normalisation     ``normalize``

The *on_progress* callback receives JSON-serialisable dicts so the WebSocket
layer can relay real-time status updates to subscribed clients.

LLM 블록(Step 6.5)은 ``ENABLE_LLM_MEAL_PLANNER=true`` 이고 ``redis_client``와
``llm_context`` 가 제공될 때만 실행된다.  오류 시 standard mode 로 폴백하며
``final_out`` 에 ``mode``, ``ui_hint``, ``quota_exceeded`` 필드가 추가된다.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any, Callable, Dict, List

from . import (
    calorie_adjuster,
    macro_rebalancer,
    micronutrient_checker,
    nutrition_normalizer,
    phi_minimizer,
    variety_optimizer,
)
from .allergen_filter import RecipeSlot, filter_allergens
from .llm_reranker import llm_rerank_and_narrate
from .llm_schema import LlmRerankResult
from ..config import settings

__all__ = ["run_pipeline"]

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _emit(
    on_progress: Callable[[Dict[str, Any]], None], payload: Dict[str, Any]
) -> None:  # noqa: D401
    """Safety wrapper that shields *on_progress* exceptions from the engine."""

    try:
        maybe_awaitable = on_progress(payload)
        if asyncio.iscoroutine(maybe_awaitable):
            await maybe_awaitable
    except Exception:  # noqa: BLE001 – never let WS progress crash the engine
        _logger.exception(
            "on_progress callback raised – ignoring to keep pipeline alive"
        )


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
    redis_client: Any = None,
    llm_context: Dict[str, Any] | None = None,
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
    tdee = prof_cal.get(
        "tdee_kcal", prof_cal.get("tdee", preferences.get("tdee", 2000))
    )
    primary_goal = prof_cal.get(
        "primary_goal", preferences.get("primary_goal", "maintenance")
    )
    activity_level = prof_cal.get("activity_level", "moderate")

    target_kcal = calorie_adjuster.adjust_calories(tdee, primary_goal, activity_level)

    await _emit(on_progress, {"pass": 1, "pct": 30})

    # --- 1b. Allergen filter ---------------------------------------------
    user_allergies = preferences.get("allergies", [])
    user_intolerances = preferences.get("intolerances", [])
    draft_recipes = filter_allergens(
        base_diet.get("recipes", []), user_allergies, user_intolerances, candidate_pool
    )  # type: ignore[arg-type]

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
        medications=prof_macro.get("medications") or [],
    )

    await _emit(on_progress, {"pass": 2, "pct": 25})

    # Step 3 – Allergen (already applied in pass 1 but re-run against updated pool)
    safe_recipes = filter_allergens(
        draft_recipes, user_allergies, user_intolerances, candidate_pool
    )

    await _emit(on_progress, {"pass": 2, "pct": 35})

    # Step 4 – Micronutrient adequacy (simplified – aggregate per-recipe nutrition)
    daily_totals: Dict[str, float] = {}
    for slot in safe_recipes:
        # Assume each slot has nutrition dict for simplification purposes.
        nutr = slot.nutrition or {}
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

    # Step 5.5 – LLM Reranker + Narrator (optional, spec §5.8)
    llm_result: LlmRerankResult | None = None
    if (
        settings.ENABLE_LLM_MEAL_PLANNER
        and redis_client is not None
        and llm_context is not None
        and varied_plan
    ):
        try:
            prof_llm = phi_minimizer.minimize_profile(bio_profile, "llm_ranking")
            llm_result = await llm_rerank_and_narrate(
                varied_plan=varied_plan,
                candidate_pool=candidate_pool,
                llm_profile=prof_llm,
                persona_id=llm_context.get("persona_id", ""),
                plan_id=plan_id,
                user_id_hash=llm_context.get("user_id_hash", ""),
                user_allergies=user_allergies,
                redis_client=redis_client,
            )
        except Exception:  # noqa: BLE001
            _logger.exception("pipeline step5.5 llm_reranker crashed, standard mode")
            llm_result = LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    await _emit(on_progress, {"pass": 2, "pct": 80})

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

    # ── LLM mode 결정 ─────────────────────────────────────────────────────────
    llm_mode = llm_result.mode if llm_result else "standard"
    quota_exceeded = llm_result.quota_exceeded if llm_result else False
    # Gemini BS-NEW-03: ui_hint 강제 (LLM-DESIGN §S3)
    ui_hint: str | None = (
        "일시적인 지연으로 기본 식단을 제공합니다." if llm_mode == "standard" else None
    )
    # BS-NEW-03 final_out 가드 — standard/llm 양쪽 경로에서 항상 set.
    llm_provenance: Dict[str, Any] | None = (
        llm_result.provenance.model_dump()
        if (llm_result is not None and llm_result.provenance is not None)
        else None
    )

    # ── weekly_plan 직렬화 ────────────────────────────────────────────────────
    display_plan: List[Any] = (
        llm_result.ranked_plan if (llm_result and llm_mode == "llm") else varied_plan
    )

    def _serialize_slot(slot: Any) -> Dict[str, Any]:
        """RecipeSlot 또는 llm ranked dict 모두 처리."""
        if isinstance(slot, dict):
            return {
                "meal_type": slot.get("meal_type", ""),
                "recipe_id": slot.get("recipe_id", ""),
                "rank": slot.get("rank"),
                "narrative": slot.get("narrative") or None,
                "citations": slot.get("citations", []) or [],
            }
        return {"meal_type": slot.meal_type, "recipe_id": slot.recipe_id}

    # Final assemble -------------------------------------------------------
    final_out: Dict[str, Any] = {
        "plan_id": plan_id,
        "status": "completed",
        "mode": llm_mode,
        "quota_exceeded": quota_exceeded,
        "ui_hint": ui_hint,
        "llm_provenance": llm_provenance,
        "target_kcal": target_kcal,
        "macros": macros,
        "micronutrient_report": micro_report.__dict__,
        "nutrition_standard": nutrition_std.asdict(),
        "weekly_plan": [
            {
                "day": i + 1,
                "date": (date.today() + timedelta(days=i)).isoformat(),
                "meals": [_serialize_slot(slot) for slot in day_slots],
                "daily_totals": {
                    "calories": round(float(target_kcal), 2),
                    "protein_g": round(float(macros.get("protein_g", 0.0)), 2),
                    "carbs_g": round(float(macros.get("carb_g", 0.0)), 2),
                    "fat_g": round(float(macros.get("fat_g", 0.0)), 2),
                },
            }
            for i, day_slots in enumerate(display_plan)
        ],
    }

    await _emit(on_progress, {"pass": 2, "pct": 100})

    return final_out
