"""Plan solver — OR-Tools CP-SAT (spec.md §5.3 Step 6 정밀화).

기존 round-robin (`pipeline._build_weekly_plan`) + greedy variety
(`variety_optimizer.optimize_variety`) 를 대체하는 결정적 ILP solver.

Variables:
    x[d, mt, i] ∈ {0,1}  — day d, meal_type mt, recipe index i 선택 여부

제약 (hard constraints):
    1. 슬롯당 정확히 1 recipe: ∑_i x[d, mt, i] = 1 (pool 비어있지 않은 경우)
    2. allergen / forbidden_ids 차단: x[d, mt, i] = 0 (i ∈ forbidden)
    3. max_repeats: ∑_{d, mt} x[d, mt, i] ≤ max_repeats (각 recipe)
    4. kcal band: target_kcal - 100 ≤ ∑_{mt, i} cal × x[d, mt, i] ≤ target_kcal + 100
    5. protein 최소: ∑_{mt, i} prot × x[d, mt, i] ≥ macros.protein_g × 0.95
    6. fat_ratio band: 0.20 ≤ fat_kcal / total_kcal ≤ 0.35 (선형화)

목적 (minimize):
    λ_kcal × |kcal_gap_d|
    + λ_protein × protein_shortfall_d
    + λ_macro × fat_band_violation
    + λ_variety × repeats
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from .allergen_filter import RecipeSlot

__all__ = [
    "build_meal_plan",
    "ILPTimeoutError",
    "ILPInfeasibleError",
]

_logger = logging.getLogger(__name__)


class ILPTimeoutError(Exception):
    """time_limit_sec 초과로 solver 가 feasible 해 미발견."""


class ILPInfeasibleError(Exception):
    """제약 조건을 만족하는 해가 존재하지 않음 (pool 부족 / 매크로 불가능)."""


DEFAULT_WEIGHTS: Dict[str, float] = {
    "kcal": 1.0,
    "protein": 0.5,
    "macro": 0.3,
    "variety": 0.2,
}

_REQUIRED_NUTRITION_KEYS: Tuple[str, ...] = ("calories", "protein_g", "fat_g")
_SCALE = 10
_WEIGHT_SCALE = 100
_FAT_RATIO_LOWER = 20  # 0.20 = 20 / 100
_FAT_RATIO_UPPER = 35  # 0.35 = 35 / 100
_MEAL_TYPES_DEFAULT: Tuple[str, ...] = ("breakfast", "lunch", "dinner", "snack")


def _scale(value: float) -> int:
    return int(round(value * _SCALE))


def _merge_weights(custom: Dict[str, float] | None) -> Dict[str, float]:
    weights = DEFAULT_WEIGHTS.copy()
    if not custom:
        return weights
    for key, value in custom.items():
        if key in weights and value is not None:
            weights[key] = float(value)
    return weights


def _linear_expr(terms: List[Tuple[int, cp_model.IntVar]]) -> cp_model.LinearExpr:
    if not terms:
        return cp_model.LinearExpr.constant(0)
    expr = 0
    for coeff, var in terms:
        expr += coeff * var
    return expr


def build_meal_plan(
    candidate_pool: List[RecipeSlot],
    target_kcal: int,
    macros: Dict[str, float],
    duration_days: int,
    max_repeats: int = 2,
    forbidden_ids: set[str] | None = None,
    meal_types: Tuple[str, ...] = _MEAL_TYPES_DEFAULT,
    time_limit_sec: float = 10.0,
    random_seed: int = 42,
    weights: Dict[str, float] | None = None,
) -> List[List[RecipeSlot]]:
    """CP-SAT 으로 duration_days × meal_types 슬롯 식단 결정.

    Args:
        candidate_pool: 알레르겐 필터 통과한 RecipeSlot list. nutrition dict 필수.
        target_kcal: 1일 목표 칼로리 (kcal). PR-B/C 의 calorie_adjuster 출력.
        macros: {protein_g, carbs_g, fat_g} 1일 목표.
        duration_days: 식단 일 수 (보통 7).
        max_repeats: 한 recipe 의 전체 plan 내 최대 등장 횟수.
        forbidden_ids: 사전 차단할 recipe_id set (alleregen 외 추가 제약).
        meal_types: 각 day 의 슬롯 종류.
        time_limit_sec: solver wall-clock 한도. 초과 시 ILPTimeoutError.
        random_seed: 결정성 seed.
        weights: λ_kcal/protein/macro/variety override. None → DEFAULT_WEIGHTS.

    Returns:
        weekly_plan: list[list[RecipeSlot]] (length=duration_days, 각 day = meal_types
                     순서대로 RecipeSlot list, pool 비어있는 meal_type 은 skip).

    Raises:
        ILPTimeoutError: time_limit_sec 초과.
        ILPInfeasibleError: solver status == INFEASIBLE.
    """

    if duration_days <= 0:
        raise ValueError("duration_days must be positive")
    if target_kcal <= 0:
        raise ValueError("target_kcal must be positive")
    if max_repeats < 1:
        raise ValueError("max_repeats must be at least 1")
    if time_limit_sec <= 0:
        raise ValueError("time_limit_sec must be positive")
    if "protein_g" not in macros:
        raise ValueError("macros must include protein_g")

    forbidden: set[str] = set(forbidden_ids or set())
    meal_types_tuple: Tuple[str, ...] = meal_types or _MEAL_TYPES_DEFAULT

    pool_by_type: Dict[str, List[RecipeSlot]] = {}
    slot_coeffs: Dict[int, Tuple[int, int, int]] = {}
    for slot in candidate_pool:
        if slot.recipe_id in forbidden:
            continue
        nutrition = slot.nutrition
        if nutrition is None:
            raise ValueError("candidate_pool slots must include nutrition data")
        missing = [key for key in _REQUIRED_NUTRITION_KEYS if key not in nutrition]
        if missing:
            raise ValueError(f"nutrition missing required key: {missing[0]}")
        calories = _scale(float(nutrition["calories"]))
        protein = _scale(float(nutrition["protein_g"]))
        fat_kcal = int(round(float(nutrition["fat_g"]) * 9.0 * _SCALE))
        slot_coeffs[id(slot)] = (calories, protein, fat_kcal)
        pool_by_type.setdefault(slot.meal_type, []).append(slot)

    assignable_slots = sum(len(pool_by_type.get(mt, [])) for mt in meal_types_tuple)
    if assignable_slots == 0:
        raise ILPInfeasibleError(
            "candidate pool has no recipes for requested meal types"
        )

    model = cp_model.CpModel()
    weights_cfg = _merge_weights(weights)
    weight_coeffs = {k: int(round(v * _WEIGHT_SCALE)) for k, v in weights_cfg.items()}

    day_cal_terms: Dict[int, List[Tuple[int, cp_model.IntVar]]] = {
        day: [] for day in range(duration_days)
    }
    day_protein_terms: Dict[int, List[Tuple[int, cp_model.IntVar]]] = {
        day: [] for day in range(duration_days)
    }
    day_fat_terms: Dict[int, List[Tuple[int, cp_model.IntVar]]] = {
        day: [] for day in range(duration_days)
    }
    selections: Dict[Tuple[int, str], List[Tuple[cp_model.IntVar, RecipeSlot]]] = {}
    recipe_usage_vars: Dict[str, List[cp_model.IntVar]] = {}

    total_binary_vars = 0
    for day in range(duration_days):
        for meal_type in meal_types_tuple:
            options = pool_by_type.get(meal_type, [])
            if not options:
                continue
            choice_vars: List[cp_model.IntVar] = []
            for idx, slot in enumerate(options):
                var = model.NewBoolVar(f"x_d{day}_{meal_type}_{idx}")
                choice_vars.append(var)
                selections.setdefault((day, meal_type), []).append((var, slot))
                recipe_usage_vars.setdefault(slot.recipe_id, []).append(var)
                calories, protein, fat_kcal = slot_coeffs[id(slot)]
                day_cal_terms[day].append((calories, var))
                day_protein_terms[day].append((protein, var))
                day_fat_terms[day].append((fat_kcal, var))
            model.Add(sum(choice_vars) == 1)
            total_binary_vars += len(choice_vars)

    if total_binary_vars == 0:
        raise ILPInfeasibleError("no assignable slots remain after filtering")

    variety_penalties: List[cp_model.IntVar] = []
    slots_per_day = len(meal_types_tuple) if meal_types_tuple else 1
    count_upper = duration_days * max(1, slots_per_day)
    for idx, (recipe_id, vars_for_recipe) in enumerate(recipe_usage_vars.items()):
        count_var = model.NewIntVar(0, count_upper, f"usage_{idx}")
        model.Add(count_var == sum(vars_for_recipe))
        model.Add(count_var <= max_repeats)
        surplus = model.NewIntVar(0, count_upper, f"surplus_{idx}")
        model.Add(surplus >= count_var - 1)
        model.Add(surplus <= count_var)
        variety_penalties.append(surplus)

    target_kcal_scaled = _scale(float(target_kcal))
    band_scaled = _scale(100)
    lower_kcal = max(target_kcal_scaled - band_scaled, 0)
    upper_kcal = target_kcal_scaled + band_scaled
    protein_target_scaled = _scale(float(macros["protein_g"]) * 0.95)

    kcal_gaps: List[cp_model.IntVar] = []
    protein_shortfalls: List[cp_model.IntVar] = []

    for day in range(duration_days):
        total_cal = _linear_expr(day_cal_terms[day])
        total_protein = _linear_expr(day_protein_terms[day])
        total_fat_kcal = _linear_expr(day_fat_terms[day])

        model.Add(total_cal >= lower_kcal)
        model.Add(total_cal <= upper_kcal)

        gap_pos = model.NewIntVar(0, band_scaled, f"gap_pos_d{day}")
        gap_neg = model.NewIntVar(0, band_scaled, f"gap_neg_d{day}")
        model.Add(total_cal - target_kcal_scaled == gap_pos - gap_neg)
        abs_gap = model.NewIntVar(0, 2 * band_scaled, f"kcal_gap_abs_d{day}")
        model.Add(abs_gap == gap_pos + gap_neg)
        kcal_gaps.append(abs_gap)

        model.Add(total_protein >= protein_target_scaled)
        protein_shortfall = model.NewIntVar(
            0, protein_target_scaled, f"protein_shortfall_d{day}"
        )
        model.Add(protein_shortfall >= protein_target_scaled - total_protein)
        protein_shortfalls.append(protein_shortfall)

        model.Add(total_fat_kcal * 100 >= _FAT_RATIO_LOWER * total_cal)
        model.Add(total_fat_kcal * 100 <= _FAT_RATIO_UPPER * total_cal)

    objective_terms: List[cp_model.LinearExpr] = []
    if kcal_gaps and weight_coeffs.get("kcal"):
        objective_terms.append(sum(weight_coeffs["kcal"] * gap for gap in kcal_gaps))
    if protein_shortfalls and weight_coeffs.get("protein"):
        objective_terms.append(
            sum(weight_coeffs["protein"] * gap for gap in protein_shortfalls)
        )
    if variety_penalties and weight_coeffs.get("variety"):
        objective_terms.append(
            sum(weight_coeffs["variety"] * var for var in variety_penalties)
        )
    if weight_coeffs.get("macro"):
        objective_terms.append(cp_model.LinearExpr.constant(0))

    objective = 0
    for term in objective_terms:
        objective += term
    model.Minimize(objective)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_sec
    solver.parameters.random_seed = random_seed
    solver.parameters.num_search_workers = 1
    solver.parameters.log_search_progress = False

    status = solver.Solve(model)
    status_name = (
        solver.StatusName(status) if hasattr(solver, "StatusName") else str(status)
    )
    objective_value = (
        solver.ObjectiveValue()
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        else None
    )
    if objective_value is not None:
        _logger.info(
            "plan solver finished with status=%s objective=%.2f",
            status_name,
            objective_value,
        )
    else:
        _logger.info("plan solver finished with status=%s", status_name)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        plan: List[List[RecipeSlot]] = []
        for day in range(duration_days):
            day_plan: List[RecipeSlot] = []
            for meal_type in meal_types_tuple:
                options = selections.get((day, meal_type), [])
                if not options:
                    continue
                chosen = None
                for var, slot in options:
                    if solver.BooleanValue(var):
                        chosen = slot
                        break
                if chosen is None:
                    raise RuntimeError(
                        f"solver produced no assignment for day {day}, meal_type {meal_type}"
                    )
                day_plan.append(chosen)
            plan.append(day_plan)
        return plan

    if status == cp_model.INFEASIBLE:
        raise ILPInfeasibleError("ILP solver returned INFEASIBLE status")
    if status == cp_model.UNKNOWN:
        raise ILPTimeoutError("ILP solver timed out before finding a solution")

    raise RuntimeError(f"Unexpected solver status: {status_name}")
