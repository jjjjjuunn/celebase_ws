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
import random
from datetime import date, timedelta
from typing import Any, Callable, Dict, List

from . import (
    calorie_adjuster,
    macro_rebalancer,
    micronutrient_checker,
    nutrition_aggregator,
    nutrition_normalizer,
    phi_minimizer,
    plan_solver,
    variety_optimizer,
)
from .allergen_filter import RecipeSlot, filter_allergens
from .llm_reranker import llm_rerank_and_narrate
from .llm_schema import LlmRerankResult
from .llm_metrics import metrics as llm_metrics_singleton
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


_DAILY_TOTALS_TOP_LEVEL_KEYS: frozenset[str] = frozenset(
    {"calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg", "sugar_g"}
)


def _round_totals(totals: Dict[str, float]) -> Dict[str, Any]:
    """aggregate_day flat output → DailyTotalsSchema 형태.

    aggregator 는 macros 와 18 micronutrient 를 모두 flat 으로 반환하지만
    shared-types `DailyTotalsSchema` (packages/shared-types/src/jsonb/index.ts) 는
    macros 를 top-level / micronutrients 를 nested `micronutrients` dict 로 분리.
    Zod 의 일관된 parse 를 위해 본 함수가 reshape 한다.

    각 수치는 2 자리 round (JSON 직렬화 친화). macros 4 키는 빈 day 대비 0.0 fallback
    (`setdefault`) — FE 의 calories 직접 렌더 호환. 단 NUTRITION_BOUNDS.min_daily_kcal
    위반 silent-fail 가능성은 별도 chore (PR-D ILP infeasible 분기) 로 위임.
    """
    rounded_top: Dict[str, Any] = {}
    micronutrients: Dict[str, float] = {}
    for key, value in totals.items():
        v = round(float(value), 2)
        if key in _DAILY_TOTALS_TOP_LEVEL_KEYS:
            rounded_top[key] = v
        else:
            micronutrients[key] = v
    for required in ("calories", "protein_g", "carbs_g", "fat_g"):
        rounded_top.setdefault(required, 0.0)
    if micronutrients:
        rounded_top["micronutrients"] = micronutrients
    return rounded_top


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

    # --- 1b. Allergen filter ---------------------------------------------
    user_allergies = preferences.get("allergies", [])
    user_intolerances = preferences.get("intolerances", [])
    draft_recipes = filter_allergens(
        base_diet.get("recipes", []), user_allergies, user_intolerances, candidate_pool
    )  # type: ignore[arg-type]

    await _emit(on_progress, {"pass": 1, "pct": 100})

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

    # Step 4 – Micronutrient adequacy (P0.2: nutrition_aggregator 위임)
    # nested micronutrients dict 도 flat 으로 풀어내 18-nutrient 매칭 가능.
    daily_totals = nutrition_aggregator.aggregate_day(safe_recipes)

    # IMPL-MEAL-P0-RDA-001: bio_profile.sex 전달 → female RDA override 적용
    # (Vit A/K/Mg/Zn/omega3 female RDA < male baseline — 미전달 시 false-positive 결핍)
    sex_raw = bio_profile.get("sex", "unisex")
    user_sex: str = sex_raw if sex_raw in ("male", "female") else "unisex"
    micro_report = micronutrient_checker.check_micronutrients(
        daily_totals,
        sex=user_sex,  # type: ignore[arg-type]
    )

    await _emit(on_progress, {"pass": 2, "pct": 55})

    # Step 5 – ILP solver (P0.4 — Plan §Task 5) with fallback to legacy variety optimiser.
    varied_plan: List[List[RecipeSlot]] = []
    ilp_attempted = False
    if settings.PIPELINE_USE_ILP:
        ilp_attempted = True
        try:
            varied_plan = plan_solver.build_meal_plan(
                candidate_pool=safe_recipes,
                target_kcal=int(target_kcal),
                macros=macros,
                duration_days=duration_days,
                time_limit_sec=settings.ILP_TIME_LIMIT_SEC,
                random_seed=settings.ILP_RANDOM_SEED,
                weights=settings.PIPELINE_ILP_WEIGHTS or None,
            )
            llm_metrics_singleton.record_ilp_success(status="optimal_or_feasible")
        except plan_solver.ILPTimeoutError:
            llm_metrics_singleton.record_ilp_timeout(reason="solver_timeout")
            varied_plan = []
        except plan_solver.ILPInfeasibleError:
            llm_metrics_singleton.record_ilp_infeasible(reason="ilp_infeasible")
            varied_plan = []
        except plan_solver.ILPModelError:
            llm_metrics_singleton.record_ilp_model_error(reason="model_invalid")
            _logger.exception(
                "ILP solver returned MODEL_INVALID — falling back to variety optimiser"
            )
            varied_plan = []

    # Fallback (PIPELINE_USE_ILP=false or ILP exception caught above)
    if not varied_plan:
        weekly_plan = _build_weekly_plan(safe_recipes, duration_days)
        if weekly_plan and any(day for day in weekly_plan):
            # Gemini r1 HIGH #2 fix: seeded rng → fallback path 결정성 보장
            fallback_rng = random.Random(settings.ILP_RANDOM_SEED)
            varied_plan = variety_optimizer.optimize_variety(
                weekly_plan, candidate_pool, rng=fallback_rng
            )
        if not varied_plan and ilp_attempted:
            # PR-C2 deferred_backlog 해결: ILP 시도 후 fallback 도 빈 plan 이면 fail-closed.
            # _round_totals 의 0.0 silent plan 방지 — FE 가 status='failed' schema 로 받음.
            raise plan_solver.ILPInfeasibleError(
                "Both ILP solver and variety_optimizer fallback produced empty plan"
            )

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
        # P0.3 합산은 RecipeSlot 보장된 varied_plan[i] 에서 수행.
        # display_plan 은 LLM mode 일 때 list[list[dict]] (llm_reranker 가
        # recipe_id/meal_type/rank/narrative/citations 만 직렬화 — nutrition 부재).
        # LLM rerank 는 day/slot 구조를 보존하고 enrichment 만 부여하므로 (llm_reranker.py
        # ranked_plan 재구성 루프 참조), varied_plan[i] 의 합산 = display_plan[i] 의 영양 합산.
        "weekly_plan": [
            {
                "day": i + 1,
                "date": (date.today() + timedelta(days=i)).isoformat(),
                "meals": [_serialize_slot(slot) for slot in day_slots],
                "daily_totals": _round_totals(
                    nutrition_aggregator.aggregate_day(
                        varied_plan[i] if i < len(varied_plan) else []
                    )
                ),
                "daily_targets": {
                    "target_kcal": round(float(target_kcal), 2),
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
