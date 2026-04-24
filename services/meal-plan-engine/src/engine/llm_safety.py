"""LLM Safety Gates (2, 3, 5, 6) — spec.md §5.8, LLM-DESIGN.md §S7."""

from __future__ import annotations

import re

__all__ = [
    "AllergenViolationError",
    "PoolViolationError",
    "assert_recipe_ids_in_pool",
    "assert_no_allergen_violation",
    "check_endorsement_regex",
    "append_disclaimer",
]

# Gate 6: 의료 효능 주장 금지 패턴 — LLM-DESIGN §S7
_ENDORSEMENT_RE = re.compile(
    r"(치료|완치|치유|예방|완화|억제|근치|의약|처방|진단|임상\s*증거|의학적으로"
    r"|cure|treat|diagnose|prescri|medically\s*proven)",
    re.IGNORECASE,
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
