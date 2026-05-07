"""IMPL-AI-003 — pipeline.run_pipeline progress emit shape tests.

각 progress event 가 4-stage transparency wire (`type`, `pass`, `pct`, `stage`,
`detail`) 를 emit 하는지, 그리고 모든 stage label 이 한 번 이상 등장하는지
검증한다. detail 문자열은 PHI-free (집계값만) 이어야 한다.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from src.engine.allergen_filter import RecipeSlot
from src.engine.pipeline import run_pipeline


_VALID_STAGES = {
    "analyzing_profile",
    "selecting_recipes",
    "verifying_nutrition",
    "personalizing",
}

_PHI_FORBIDDEN_TOKENS = (
    "user_id",
    "email",
    "@",
    "diabetes",
    "hypertension",
    "peanut",
    "gluten",
    "dairy",
    "lactose",
)


def _mk_slot(rid: str, meal: str = "lunch") -> RecipeSlot:
    return RecipeSlot(recipe_id=rid, meal_type=meal, allergens=[], ingredients=[])


def _baseline_inputs(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    pool: List[RecipeSlot] = [_mk_slot(f"r{i}") for i in range(3)]

    def capture(payload: Dict[str, Any]) -> None:
        events.append(payload)

    return {
        "plan_id": "plan-emit-shape",
        "base_diet": {"recipes": list(pool)},
        "bio_profile": {
            "weight_kg": 70,
            "activity_level": "moderate",
            "tdee": 2200,
            "primary_goal": "maintenance",
        },
        "preferences": {"allergies": [], "intolerances": []},
        "candidate_pool": pool,
        "duration_days": 3,
        "on_progress": capture,
    }


@pytest.mark.asyncio
async def test_progress_events_carry_stage_and_type() -> None:
    """모든 progress event 는 type='progress' + 유효한 stage 라벨을 carry."""
    events: List[Dict[str, Any]] = []
    await run_pipeline(**_baseline_inputs(events))

    assert events, "pipeline emitted no progress events"
    for ev in events:
        assert ev["type"] == "progress", ev
        assert ev["pass"] in (1, 2), ev
        assert isinstance(ev["pct"], int) and 0 <= ev["pct"] <= 100, ev
        assert ev["stage"] in _VALID_STAGES, ev
        assert "detail" in ev, ev
        assert ev["detail"] is None or isinstance(ev["detail"], str), ev


@pytest.mark.asyncio
async def test_progress_first_stage_is_analyzing_profile() -> None:
    """첫 emit 은 stage='analyzing_profile' (사용자가 stepper 진입 즉시 보는 것)."""
    events: List[Dict[str, Any]] = []
    await run_pipeline(**_baseline_inputs(events))

    assert events[0]["stage"] == "analyzing_profile"
    assert events[0]["pass"] == 1
    assert events[0]["pct"] == 0


@pytest.mark.asyncio
async def test_progress_covers_three_core_stages_in_standard_mode() -> None:
    """LLM 비활성 standard path → stage 1·2·3 모두 적어도 1번 emit."""
    events: List[Dict[str, Any]] = []
    await run_pipeline(**_baseline_inputs(events))

    seen = {ev["stage"] for ev in events}
    for required in ("analyzing_profile", "selecting_recipes", "verifying_nutrition"):
        assert required in seen, (required, seen)


@pytest.mark.asyncio
async def test_progress_detail_strings_are_phi_free() -> None:
    """detail 문자열은 집계값만 — user_id / 알레르기 / 의료 조건 토큰 누출 금지."""
    events: List[Dict[str, Any]] = []
    await run_pipeline(**_baseline_inputs(events))

    for ev in events:
        detail = ev.get("detail")
        if detail is None:
            continue
        lower = detail.lower()
        for token in _PHI_FORBIDDEN_TOKENS:
            assert token not in lower, (token, detail)
        # detail length is capped by wire schema (120 chars).
        assert len(detail) <= 120, detail


@pytest.mark.asyncio
async def test_progress_pct_monotonic_non_decreasing_within_pass() -> None:
    """pass 내부에서 pct 는 단조 비감소. stepper 가 거꾸로 가는 것을 방지."""
    events: List[Dict[str, Any]] = []
    await run_pipeline(**_baseline_inputs(events))

    last_by_pass: Dict[int, int] = {1: -1, 2: -1}
    for ev in events:
        p = ev["pass"]
        assert ev["pct"] >= last_by_pass[p], ev
        last_by_pass[p] = ev["pct"]
