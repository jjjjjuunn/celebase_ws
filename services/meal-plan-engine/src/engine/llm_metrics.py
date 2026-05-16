"""LLM 메트릭 10종 수집기 — spec.md §5.8, LLM-DESIGN.md §S10.

Prometheus 연동 없이 structured JSON 로깅으로 기록한다.
프로세스 재시작 시 카운터 초기화 (MVP 범위).
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from typing import Any

__all__ = [
    "LlmMetrics",
    "metrics",
]

_logger = logging.getLogger(__name__)

# LLM-DESIGN §S10 — 10개 메트릭 목록
_METRIC_NAMES = (
    "llm_calls_total",  # LLM 호출 시도 (mode × reason)
    "llm_standard_mode_calls_total",  # standard mode 반환 (reason 세분)
    "llm_quota_rejections_total",  # Elite quota 초과
    "llm_rollout_skip_total",  # rollout pct 미달로 건너뜀
    "llm_safety_gate_failures_total",  # Safety Gate 위반 (gate 세분)
    "llm_tokens_input_total",  # 입력 토큰 누적
    "llm_tokens_output_total",  # 출력 토큰 누적 (max_tokens 기준 추정)
    "llm_cost_usd_total",  # 비용 누적 (Gate 0 추정치)
    "llm_latency_seconds_total",  # 지연 시간 누적 (llm mode 한정)
    "llm_latency_calls",  # 지연 시간 샘플 수 (p95 계산용)
)


class LlmMetrics:
    """스레드 안전 인메모리 카운터 — process-scoped singleton."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[str, float] = defaultdict(float)

    def inc(self, name: str, value: float = 1.0, **labels: str) -> None:
        """카운터를 value 만큼 증가시키고 structured JSON으로 로깅."""
        key = name + (
            "_" + "_".join(f"{k}={v}" for k, v in sorted(labels.items()))
            if labels
            else ""
        )
        with self._lock:
            self._counters[key] += value
        _logger.info(
            "llm_metric name=%s value=%s labels=%s",
            name,
            value,
            labels,
        )

    def record_call(
        self,
        *,
        mode: str,
        reason: str,
        estimated_cost: float = 0.0,
        input_tokens: int = 0,
        latency_s: float = 0.0,
    ) -> None:
        """LLM 호출 1건 종합 기록 — LLM-DESIGN §S10."""
        self.inc("llm_calls_total", mode=mode, reason=reason)
        if mode == "standard":
            self.inc("llm_standard_mode_calls_total", reason=reason)
        if estimated_cost > 0:
            self.inc("llm_cost_usd_total", value=estimated_cost)
        if input_tokens > 0:
            self.inc("llm_tokens_input_total", value=float(input_tokens))
        if latency_s > 0:
            self.inc("llm_latency_seconds_total", value=latency_s)
            self.inc("llm_latency_calls")

    def record_ilp_success(self, *, status: str) -> None:
        """ILP solver 성공 (OPTIMAL or FEASIBLE) — IMPL-MEAL-P0-ILP-001-b."""
        self.inc("ilp_success_total", status=status)

    def record_ilp_timeout(self, *, reason: str) -> None:
        """ILP solver time_limit_sec 초과 → fallback 진입."""
        self.inc("ilp_timeout_total", reason=reason)

    def record_ilp_infeasible(self, *, reason: str) -> None:
        """ILP solver INFEASIBLE → fallback 진입 또는 fail-closed."""
        self.inc("ilp_infeasible_total", reason=reason)

    def record_ilp_model_error(self, *, reason: str) -> None:
        """ILP solver MODEL_INVALID (수학적 모델링 오류) — 운영 alert 신호."""
        self.inc("ilp_model_error_total", reason=reason)

    def record_gate_failure(self, gate: str, reason: str | None = None) -> None:
        """Safety Gate 위반 1건 기록.

        gate=2 처럼 한 게이트가 여러 sub-원인(duplicate_ids / pool_violation /
        partial_response)을 가지면 ``reason`` 으로 세분한다. 알람 룰에서
        ``llm_safety_gate_failures_total{gate="2",reason="pool_violation"}``
        형태로 dispatch 가능.
        """
        if reason is None:
            self.inc("llm_safety_gate_failures_total", gate=gate)
        else:
            self.inc("llm_safety_gate_failures_total", gate=gate, reason=reason)

    def snapshot(self) -> dict[str, Any]:
        """현재 카운터 스냅샷 반환 (테스트 + 운영 감사용)."""
        with self._lock:
            return dict(self._counters)


# 프로세스 싱글톤 — 모든 모듈에서 이 인스턴스를 공유한다
metrics = LlmMetrics()
