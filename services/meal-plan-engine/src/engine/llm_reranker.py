"""LLM Reranker + Narrator — spec.md §5.8, LLM-DESIGN.md §S3.

variety_optimizer 이후 · nutrition_normalizer 이전 단일 진입 지점.
모든 오류는 LlmRerankResult(mode="standard")로 폴백한다 (Gemini BS-01).
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from datetime import date
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader
from openai import OpenAIError
from pydantic import ValidationError

from ..clients.llm_client import (
    call_openai_ranker,
    check_global_kill_switch,
    estimate_prompt_cost,
    increment_monthly_cost,
    try_claim_elite_quota,
)
from ..config import settings
from .allergen_filter import RecipeSlot
from .llm_metrics import metrics
from .llm_safety import (
    AllergenViolationError,
    LlmProfileInjectionError,
    PoolViolationError,
    assert_no_allergen_violation,
    assert_recipe_ids_in_pool,
    check_endorsement_regex,
    sanitize_llm_profile,
)
from .llm_schema import LlmProvenance, LlmRerankResult

__all__ = ["llm_rerank_and_narrate"]

_logger = logging.getLogger(__name__)

# BS-14: persona_id 프롬프트 주입 방지 — 소문자 알파벳/숫자/하이픈/밑줄, 최대 50자
_PERSONA_ID_RE = re.compile(r"^[a-z0-9_-]{1,50}$")

# Jinja2 환경 초기화 — prompts/v1/ 디렉터리 기준
_PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts" / "v1"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_PROMPTS_DIR)),
    autoescape=False,
    keep_trailing_newline=True,
)

# Pydantic JSON Schema for OpenAI structured output — LLM-DESIGN §S5
_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "meals": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["recipe_id", "rank", "narrative", "citations"],
                "properties": {
                    "recipe_id": {"type": "string", "minLength": 1},
                    "rank": {"type": "integer", "minimum": 1, "maximum": 50},
                    "narrative": {"type": "string", "minLength": 10, "maxLength": 300},
                    "citations": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "required": ["source_type", "title"],
                            "properties": {
                                "source_type": {
                                    "type": "string",
                                    "enum": [
                                        "celebrity_interview",
                                        "cookbook",
                                        "clinical_study",
                                        "usda_db",
                                        "nih_standard",
                                    ],
                                },
                                "title": {
                                    "type": "string",
                                    "minLength": 1,
                                    "maxLength": 200,
                                },
                                "url": {"type": "string"},
                                "celeb_persona": {"type": "string"},
                            },
                            "additionalProperties": False,
                        },
                    },
                },
                "additionalProperties": False,
            },
        },
        "mode": {"type": "string", "pattern": "^(llm|standard)$"},
    },
    "required": ["meals", "mode"],
    "additionalProperties": False,
}


def _build_system_prompt(persona_id: str, llm_profile: dict[str, Any]) -> str:
    """Jinja2 템플릿 기반 시스템 프롬프트 — prompts/v1/ranker_system.md.

    llm_profile 필드를 화이트리스트 검증 후 프롬프트에 삽입 (Gemini BS-03).
    """
    safe_profile = sanitize_llm_profile(llm_profile)
    tmpl = _jinja_env.get_template("ranker_system.md")
    return tmpl.render(
        persona_id=persona_id,
        primary_goal=safe_profile["primary_goal"],
        activity_level=safe_profile["activity_level"],
        diet_type=safe_profile["diet_type"],
    )


def _build_user_prompt(recipe_ids: list[str], plan_id: str, persona_id: str) -> str:
    """Jinja2 템플릿 기반 유저 프롬프트 — prompts/v1/ranker_user.md.j2."""
    tmpl = _jinja_env.get_template("ranker_user.md.j2")
    return tmpl.render(recipe_ids=recipe_ids, plan_id=plan_id, persona_id=persona_id)


def _should_run_llm(user_id_hash: str, date_str: str) -> bool:
    """LLM_ROLLOUT_PCT 기반 결정론적 rollout 판단 — LLM-DESIGN §S13.

    hash(user_id_hash + date_str) % 100 < LLM_ROLLOUT_PCT 면 True.
    같은 user + 날짜는 항상 같은 결과를 반환해 재시도 일관성을 보장한다.
    """
    pct = settings.LLM_ROLLOUT_PCT
    if pct <= 0:
        return False
    if pct >= 100:
        return True
    seed = hashlib.sha256(f"{user_id_hash}:{date_str}".encode()).digest()
    bucket = int.from_bytes(seed[:2], "big") % 100
    return bucket < pct


async def llm_rerank_and_narrate(
    varied_plan: list[list[RecipeSlot]],
    candidate_pool: list[RecipeSlot],
    llm_profile: dict[str, Any],
    persona_id: str,
    plan_id: str,
    user_id_hash: str,
    user_allergies: list[str],
    redis_client: Any,
    date_str: str | None = None,
) -> LlmRerankResult:
    """LLM 레이어 진입점 — 모든 오류는 standard mode 로 폴백한다.

    Args:
        varied_plan: variety_optimizer 출력 (List[List[RecipeSlot]])
        candidate_pool: 전체 후보 풀 (allergen map 구성에 사용)
        llm_profile: PHI 최소화된 사용자 프로파일 (primary_goal/activity_level/diet_type)
        persona_id: 셀러브리티 페르소나 ID
        plan_id: 식단 플랜 UUID (감사 추적)
        user_id_hash: HMAC-SHA256 사용자 ID 해시 (PHI 보호)
        user_allergies: 사용자 알레르기 목록 (Gate 3 검증용)
        redis_client: aioredis 클라이언트 (kill switch + quota)
        date_str: YYYYMMDD 날짜 문자열 (quota key, 기본값 오늘)

    Returns:
        LlmRerankResult with mode="llm" or mode="standard"
    """
    _date = date_str or date.today().strftime("%Y%m%d")

    pool_ids: set[str] = {slot.recipe_id for slot in candidate_pool}
    recipe_allergen_map: dict[str, list[str]] = {
        slot.recipe_id: slot.allergens for slot in candidate_pool
    }

    # ── Rollout pct check (LLM-DESIGN §S13) ─────────────────────────────────
    if not _should_run_llm(user_id_hash, _date):
        metrics.inc("llm_rollout_skip_total")
        metrics.record_call(mode="standard", reason="rollout_skip")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Kill switch (Redis llm_disabled / llm_cost_kill) ─────────────────────
    try:
        if await check_global_kill_switch(redis_client):
            _logger.info("llm_reranker kill_switch=active plan=%s", plan_id)
            metrics.record_call(mode="standard", reason="kill_switch")
            return LlmRerankResult(ranked_plan=varied_plan, mode="standard")
    except Exception:  # noqa: BLE001
        _logger.exception("llm_reranker kill_switch check error plan=%s", plan_id)
        metrics.record_call(mode="standard", reason="kill_switch_error")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Elite daily quota — 원자적 INCR 예약 (Gemini BS-02 TOCTOU 방지) ────────
    try:
        if not await try_claim_elite_quota(
            redis_client, user_id_hash, _date, settings.ELITE_DAILY_LLM_SOFT_LIMIT
        ):
            _logger.info(
                "llm_reranker quota_exceeded user=%s plan=%s", user_id_hash, plan_id
            )
            metrics.inc("llm_quota_rejections_total")
            metrics.record_call(mode="standard", reason="quota_exceeded")
            return LlmRerankResult(
                ranked_plan=varied_plan, mode="standard", quota_exceeded=True
            )
    except Exception:  # noqa: BLE001
        _logger.exception("llm_reranker quota check error plan=%s", plan_id)
        metrics.record_call(mode="standard", reason="quota_error")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Collect unique recipe IDs from varied_plan ────────────────────────────
    recipe_ids: list[str] = []
    seen: set[str] = set()
    for day_slots in varied_plan:
        for slot in day_slots:
            if slot.recipe_id not in seen:
                recipe_ids.append(slot.recipe_id)
                seen.add(slot.recipe_id)

    if not recipe_ids:
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── persona_id 검증 — 프롬프트 주입 방지 (BS-14) ─────────────────────────────
    if not _PERSONA_ID_RE.match(persona_id):
        _logger.warning(
            "llm_reranker persona_id_invalid persona=%s plan=%s", persona_id, plan_id
        )
        metrics.record_call(mode="standard", reason="persona_id_invalid")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Build prompts (Jinja2 템플릿) — injection 방어 포함 (Gemini BS-03) ──────
    try:
        system_prompt = _build_system_prompt(persona_id, llm_profile)
    except LlmProfileInjectionError:
        _logger.warning("llm_reranker profile_injection_blocked plan=%s", plan_id)
        metrics.record_call(mode="standard", reason="profile_injection")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")
    user_prompt = _build_user_prompt(recipe_ids, plan_id, persona_id)

    # ── Gate 0: tiktoken 비용 사전 추정 (Gemini BS-NEW-02) ────────────────────
    estimated_cost = estimate_prompt_cost(system_prompt, user_prompt)
    if estimated_cost > settings.LLM_COST_CAP_USD:
        _logger.warning(
            "llm_reranker gate0_cost_exceeded estimated=%.5f cap=%.5f plan=%s",
            estimated_cost,
            settings.LLM_COST_CAP_USD,
            plan_id,
        )
        metrics.record_call(
            mode="standard", reason="cost_cap", estimated_cost=estimated_cost
        )
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Core LLM call — Safety Gate 1 (Pydantic) 내부 처리 (Gemini BS-01) ────
    t0 = time.monotonic()
    try:
        parsed, prompt_hash, output_hash = await call_openai_ranker(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=_OUTPUT_SCHEMA,
        )
    except (OpenAIError, ValidationError, TimeoutError) as exc:
        elapsed = time.monotonic() - t0
        _logger.warning(
            "llm_reranker llm_call_failed type=%s plan=%s latency=%.2f",
            type(exc).__name__,
            plan_id,
            elapsed,
        )
        metrics.record_call(
            mode="standard", reason="llm_error", estimated_cost=estimated_cost
        )
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")
    except Exception:  # noqa: BLE001
        _logger.exception("llm_reranker unexpected_llm_error plan=%s", plan_id)
        metrics.record_call(
            mode="standard", reason="llm_error", estimated_cost=estimated_cost
        )
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    elapsed = time.monotonic() - t0

    # ── Gate 2: Pool 검증 + 중복 recipe_id 검사 (Gemini BS-05) ─────────────────
    llm_ids = [m.recipe_id for m in parsed.meals]
    if len(llm_ids) != len(set(llm_ids)):
        _logger.warning("llm_reranker gate2_duplicate_ids plan=%s", plan_id)
        metrics.record_gate_failure("2")
        metrics.record_call(mode="standard", reason="gate_fail")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")
    try:
        assert_recipe_ids_in_pool(llm_ids, pool_ids)
    except PoolViolationError:
        _logger.warning("llm_reranker gate2_pool_violation plan=%s", plan_id)
        metrics.record_gate_failure("2")
        metrics.record_call(mode="standard", reason="gate_fail")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Gate 2.5: 부분 응답 검증 — LLM이 입력 recipe 전부를 반환했는지 확인 (BS-16) ──
    if len(llm_ids) < len(recipe_ids):
        _logger.warning(
            "llm_reranker gate2_partial_response llm=%d expected=%d plan=%s",
            len(llm_ids),
            len(recipe_ids),
            plan_id,
        )
        metrics.record_gate_failure("2")
        metrics.record_call(mode="standard", reason="gate_fail")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Gate 3: 알레르겐 순수 검증 (mutate 금지 — Codex FINDING-02) ───────────
    try:
        assert_no_allergen_violation(llm_ids, recipe_allergen_map, user_allergies)
    except AllergenViolationError:
        _logger.warning("llm_reranker gate3_allergen_violation plan=%s", plan_id)
        metrics.record_gate_failure("3")
        metrics.record_call(mode="standard", reason="gate_fail")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Gate 4: Bounds 검증 ───────────────────────────────────────────────────
    if not (1 <= len(parsed.meals) <= len(pool_ids) + 1):
        _logger.warning(
            "llm_reranker gate4_bounds_violation meals=%d pool=%d plan=%s",
            len(parsed.meals),
            len(pool_ids),
            plan_id,
        )
        metrics.record_gate_failure("4")
        metrics.record_call(mode="standard", reason="gate_fail")
        return LlmRerankResult(ranked_plan=varied_plan, mode="standard")

    # ── Gate 5 + 6: disclaimer 첨부 + endorsement 탐지 ───────────────────────
    enriched: dict[str, dict[str, Any]] = {}
    for meal in parsed.meals:
        if check_endorsement_regex(meal.narrative):
            _logger.warning(
                "llm_reranker gate6_endorsement recipe=%s plan=%s narrative=%r",
                meal.recipe_id,
                plan_id,
                meal.narrative[:300],
            )
            metrics.record_gate_failure("6")
            metrics.record_call(mode="standard", reason="gate_fail")
            return LlmRerankResult(ranked_plan=varied_plan, mode="standard")
        enriched[meal.recipe_id] = {
            "rank": meal.rank,
            "narrative": meal.narrative,
            "citations": [c.model_dump() for c in meal.citations],
        }

    # ── ranked_plan 재구성 ─────────────────────────────────────────────────────
    ranked_plan: list[list[dict[str, Any]]] = []
    for day_slots in varied_plan:
        day: list[dict[str, Any]] = []
        for slot in day_slots:
            enrichment = enriched.get(slot.recipe_id, {})
            day.append(
                {
                    "recipe_id": slot.recipe_id,
                    "meal_type": slot.meal_type,
                    "rank": enrichment.get("rank", 999),
                    "narrative": enrichment.get("narrative", ""),
                    "citations": enrichment.get("citations", []),
                }
            )
        ranked_plan.append(day)

    provenance = LlmProvenance(
        model=settings.OPENAI_MODEL,
        prompt_hash=prompt_hash,
        output_hash=output_hash,
        mode="llm",
    )

    metrics.record_call(
        mode="llm",
        reason="success",
        estimated_cost=estimated_cost,
        input_tokens=len(system_prompt.split()) + len(user_prompt.split()),  # 근사치
        latency_s=elapsed,
    )

    # ── 월별 비용 누적 + kill switch 자동 발화 (BS-10) ──────────────────────────
    try:
        await increment_monthly_cost(redis_client, estimated_cost)
    except Exception:  # noqa: BLE001
        _logger.exception("llm_reranker monthly_cost_tracking_error plan=%s", plan_id)

    _logger.info(
        "llm_reranker success mode=llm plan=%s prompt_hash=%s latency=%.2fs cost=%.5f",
        plan_id,
        prompt_hash,
        elapsed,
        estimated_cost,
    )

    return LlmRerankResult(
        ranked_plan=ranked_plan,
        mode="llm",
        quota_exceeded=False,
        provenance=provenance,
    )
