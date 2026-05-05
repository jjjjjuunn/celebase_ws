"""LLM Safety Gates (2, 3, 5, 6) — spec.md §5.8, LLM-DESIGN.md §S7."""

from __future__ import annotations

import re

__all__ = [
    "AllergenViolationError",
    "PoolViolationError",
    "LlmProfileInjectionError",
    "assert_recipe_ids_in_pool",
    "assert_no_allergen_violation",
    "check_endorsement_regex",
    "append_disclaimer",
    "sanitize_llm_profile",
]

# Gate 6: 의료 효능 주장 금지 패턴 — LLM-DESIGN §S7, Gemini BS-01 확장
# 영어는 word boundary 필수 — `heal` 이 "healthy" 에, `treat` 이 "treats" 에
# 매치되는 false positive 방지 (IMPL-AI-002 교훈, 2026-04-30).
# 한국어 의료 용어는 word boundary 개념이 다르므로 그대로 유지.
_ENDORSEMENT_RE = re.compile(
    r"(치료|완치|치유|예방|완화|억제|근치|의약|처방|진단|임상\s*증거|의학적으로"
    r"|\bcures?\b|\btreats?\b|\btreatment\b|\bdiagnos(?:e|es|is|ing)\b"
    r"|\bprescri\w*|\bmedically\s+proven\b"
    r"|\bprevents?\b|\bheal(?:s|ed|ing)?\b|\breverses?\b"
    r"|\bmanage[s]?\s+\w*\s*blood\s+(?:sugar|pressure)|\breduce[s]?\s+\w*\s*risk"
    r"|\banti.?inflammator\w*|\bclinically.?tested?\b)",
    re.IGNORECASE,
)

# Gate BS-03: llm_profile 화이트리스트 — Gemini BS-03
_ALLOWED_PRIMARY_GOAL = frozenset(
    {
        "weight_loss",
        "muscle_gain",
        "maintenance",
        "endurance",
        "flexibility",
        "general_health",
    }
)
_ALLOWED_ACTIVITY_LEVEL = frozenset(
    {"sedentary", "lightly_active", "moderate", "active", "very_active"}
)
_ALLOWED_DIET_TYPE = frozenset(
    {
        "balanced",
        "low_carb",
        "high_protein",
        "vegan",
        "vegetarian",
        "keto",
        "mediterranean",
        "paleo",
        "gluten_free",
        "dairy_free",
    }
)

# Gate 5: 법적 면책 문구 — LLM-DESIGN §S11 UI 계약
_DISCLAIMER = (
    "\n\n*이 식단 정보는 의료 조언을 대체하지 않습니다. "
    "건강 상태 변경 전 전문의와 상담하세요.*"
)


class AllergenViolationError(ValueError):
    """Gate 3: LLM 반환 레시피에 알레르겐이 포함된 경우 — fail-closed."""


class PoolViolationError(ValueError):
    """Gate 2: LLM 반환 recipe_id가 후보 pool 외부인 경우 — fail-closed."""


class LlmProfileInjectionError(ValueError):
    """BS-03: llm_profile 필드가 허용 화이트리스트 밖인 경우 — fail-closed."""


def assert_recipe_ids_in_pool(
    meal_ids: list[str],
    pool_ids: set[str],
) -> None:
    """Gate 2: LLM 반환 recipe_id 전부가 후보 pool 내에 있는지 검증.

    Raises:
        PoolViolationError: pool 외부 ID 탐지 시 즉시 fail-closed.
    """
    unknown = [rid for rid in meal_ids if rid not in pool_ids]
    if unknown:
        raise PoolViolationError(
            f"LLM returned recipe_ids not in candidate pool: {unknown}"
        )


def assert_no_allergen_violation(
    meal_ids: list[str],
    recipe_allergen_map: dict[str, list[str]],
    user_allergies: list[str],
) -> None:
    """Gate 3: 알레르겐 위반 순수 검증 — mutate 금지 (Codex FINDING-02, LLM-DESIGN §S7).

    allergen_filter.filter_allergens()는 치환 부작용이 있으므로 호출 금지.

    Raises:
        AllergenViolationError: 위반 탐지 시 즉시 fail-closed.
    """
    blocked = {a.lower() for a in user_allergies}
    if not blocked:
        return

    violations = [
        rid
        for rid in meal_ids
        if blocked & {a.lower() for a in recipe_allergen_map.get(rid, [])}
    ]
    if violations:
        raise AllergenViolationError(
            f"LLM returned allergen-violating recipe_ids: {violations}"
        )


def check_endorsement_regex(narrative: str) -> bool:
    """Gate 6: 의료 효능 주장 금지 패턴 탐지 — LLM-DESIGN §S7 Gate 6.

    Returns:
        True if violation found (caller should fail-closed).
    """
    return bool(_ENDORSEMENT_RE.search(narrative))


def append_disclaimer(narrative: str) -> str:
    """Gate 5: 법적 면책 문구 자동 첨부 — LLM-DESIGN §S7 Gate 5."""
    return narrative + _DISCLAIMER


def sanitize_llm_profile(llm_profile: dict[str, object]) -> dict[str, str]:
    """BS-03: llm_profile 필드를 화이트리스트로 검증 후 안전한 문자열로 반환 — Gemini BS-03.

    primary_goal / activity_level / diet_type 이 허용 enum 밖인 경우
    LlmProfileInjectionError 를 raise 한다.

    Returns:
        Sanitized dict with only the 3 allowed fields as strings.
    """
    primary_goal = str(llm_profile.get("primary_goal", "maintenance"))
    activity_level = str(llm_profile.get("activity_level", "moderate"))
    diet_type = str(llm_profile.get("diet_type", "balanced"))

    if primary_goal not in _ALLOWED_PRIMARY_GOAL:
        raise LlmProfileInjectionError(
            f"primary_goal '{primary_goal}' not in allowlist"
        )
    if activity_level not in _ALLOWED_ACTIVITY_LEVEL:
        raise LlmProfileInjectionError(
            f"activity_level '{activity_level}' not in allowlist"
        )
    if diet_type not in _ALLOWED_DIET_TYPE:
        raise LlmProfileInjectionError(f"diet_type '{diet_type}' not in allowlist")
    return {
        "primary_goal": primary_goal,
        "activity_level": activity_level,
        "diet_type": diet_type,
    }
