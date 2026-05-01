"""IMPL-AI-002 Phase 4 — LlmMetrics 라벨 보강 단위 테스트.

목적:
- ``record_gate_failure(gate, reason)`` 가 reason sub-label 을 보존하는지 확인.
- gate=2 의 3개 sub-원인(duplicate_ids / pool_violation / partial_response)이
  서로 구분되어 카운트되는지 검증.
- ``record_call(reason="gate{N}_{sub}")`` 형식이 카운터 키에 그대로 반영되는지 확인.
"""

from __future__ import annotations

from src.engine.llm_metrics import LlmMetrics


def test_record_gate_failure_with_reason_distinguishes_sub_causes() -> None:
    """gate=2 의 3개 sub-원인이 별도 키로 카운트된다."""
    m = LlmMetrics()

    m.record_gate_failure("2", reason="duplicate_ids")
    m.record_gate_failure("2", reason="pool_violation")
    m.record_gate_failure("2", reason="pool_violation")
    m.record_gate_failure("2", reason="partial_response")

    snap = m.snapshot()
    # 정렬된 라벨 순서: gate=2, reason=<value> → 키 형식
    assert snap["llm_safety_gate_failures_total_gate=2_reason=duplicate_ids"] == 1.0
    assert snap["llm_safety_gate_failures_total_gate=2_reason=pool_violation"] == 2.0
    assert snap["llm_safety_gate_failures_total_gate=2_reason=partial_response"] == 1.0


def test_record_gate_failure_without_reason_back_compat() -> None:
    """reason 미지정 시 기존 형식(gate 단독) 유지."""
    m = LlmMetrics()
    m.record_gate_failure("3")
    snap = m.snapshot()
    assert snap["llm_safety_gate_failures_total_gate=3"] == 1.0


def test_record_call_gate_specific_reason_keys() -> None:
    """record_call 의 reason 라벨에 게이트 번호 prefix 가 보존된다."""
    m = LlmMetrics()

    m.record_call(mode="standard", reason="gate2_pool_violation")
    m.record_call(mode="standard", reason="gate3_allergen_violation")
    m.record_call(mode="standard", reason="gate4_bounds_violation")
    m.record_call(mode="standard", reason="gate6_endorsement")

    snap = m.snapshot()
    assert snap["llm_calls_total_mode=standard_reason=gate2_pool_violation"] == 1.0
    assert snap["llm_calls_total_mode=standard_reason=gate3_allergen_violation"] == 1.0
    assert snap["llm_calls_total_mode=standard_reason=gate4_bounds_violation"] == 1.0
    assert snap["llm_calls_total_mode=standard_reason=gate6_endorsement"] == 1.0
    # standard mode 카운터는 reason 별로 누적된다
    assert snap["llm_standard_mode_calls_total_reason=gate2_pool_violation"] == 1.0


def test_record_call_success_increments_latency_and_cost() -> None:
    """llm mode success 호출 시 latency/cost/input_tokens 누적 확인."""
    m = LlmMetrics()
    m.record_call(
        mode="llm",
        reason="success",
        estimated_cost=0.0023,
        input_tokens=125,
        latency_s=1.42,
    )
    snap = m.snapshot()
    assert snap["llm_calls_total_mode=llm_reason=success"] == 1.0
    assert abs(snap["llm_cost_usd_total"] - 0.0023) < 1e-9
    assert snap["llm_tokens_input_total"] == 125.0
    assert abs(snap["llm_latency_seconds_total"] - 1.42) < 1e-9
    assert snap["llm_latency_calls"] == 1.0
    # standard mode 가 아니므로 standard counter 는 증가하지 않는다
    assert "llm_standard_mode_calls_total_reason=success" not in snap
