"""IMPL-AI-002 Phase 3 — VCR cassette replay test.

목적:
- CI 에서 실 OpenAI 호출 없이 LLM 응답 shape 회귀 감지.
- cassette 녹화 시점의 prompt_hash 와 동일한 입력으로만 재현 (match_on=body).
- redact 검증은 별도 grep gate (scripts/check_cassette_phi.sh 또는 후속) 에서 수행.

녹화:
    RUN_LLM_REAL_CALL=1 pytest tests/llm/test_llm_cassette_replay.py -v

평소 CI:
    pytest tests/llm/test_llm_cassette_replay.py -v
    (record_mode='none' — cassette 부재 시 즉시 fail)

cassette 파일명은 fixture 가 자동 결정 (`<test_name>.yaml`).
"""

from __future__ import annotations

import pytest

from src.clients.llm_client import call_openai_ranker
from src.engine.llm_reranker import _OUTPUT_SCHEMA


# Deterministic prompts — 변경 시 cassette 재녹화 필요.
# fictional persona alias 만 사용. 실명 brand 는 conftest redact 에 의해 마스킹된다.
_SYSTEM_PROMPT = (
    "You are a wellness coach. Rank recipes for the ronaldo persona. "
    "Return JSON matching the provided schema. Set mode=llm. "
    "Each meal must include at least 1 citation."
)

_USER_PROMPT = (
    "Recipes available:\n"
    "- r-001: grilled chicken breast with quinoa\n"
    "- r-002: salmon bowl with brown rice\n"
    "- r-003: tofu stir-fry with vegetables\n"
    "Constraints: plan_id=plan-cassette-001, persona_id=ronaldo, "
    "primary_goal=weight_loss. Include all 3 recipes."
)


@pytest.mark.asyncio
@pytest.mark.vcr
async def test_cassette_replay_happy_path() -> None:
    """Cassette replay: deterministic prompt → structured output 검증."""
    parsed, prompt_hash, output_hash = await call_openai_ranker(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=_USER_PROMPT,
        json_schema=_OUTPUT_SCHEMA,
    )

    assert parsed.mode == "llm"
    assert len(parsed.meals) >= 1
    assert all(m.recipe_id for m in parsed.meals)
    assert all(len(m.citations) >= 1 for m in parsed.meals)
    assert all(10 <= len(m.narrative) <= 300 for m in parsed.meals)
    assert len(prompt_hash) == 16
    assert len(output_hash) == 16
