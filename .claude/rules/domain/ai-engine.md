---
paths:
  - "services/ai-engine/**/*"
  - "services/meal-plan-engine/**/*"
  - "**/*nutrition*"
  - "**/*macro*"
---
# AI Engine Rules

## 안전 장치 (Nutrition Bounds)

```python
NUTRITION_BOUNDS = {
    "min_daily_kcal": 1200,
    "max_daily_kcal": 5000,
    "min_protein_g_per_kg": 0.8,
    "max_protein_g_per_kg": 3.0,
    "min_fat_pct": 15,
    "max_fat_pct": 60,
    "min_carb_g": 50,
}

NUTRITION_TOLERANCE = {
    "protein_variance_pct": 5,        # USDA vs Instacart 편차 허용
    "calorie_drift_warning_pct": 10,  # 일일 칼로리 합산 오차 경고
    "micro_unit_mismatch": "BLOCK",   # IU/ug 혼동 즉시 차단
}
```

- 범위 이탈 시 bounds에 클램핑 + 사용자에게 조정 사유 표시.
- 알레르기: 대체 재료 불가 시 레시피 통째로 교체. 알레르겐 포함 레시피 제공 절대 금지.
- GLP-1 모드: 단백질 최소 체중 x 2.0g 강제.

## Source of Truth 정책 (CHORE-MEAL-TARGET-KCAL-SOT-001)

cross-service nutrition 계산의 single source 분리:

| 필드 | SoT | 비고 |
|------|-----|------|
| `bmr_kcal` | user-service `calcBmr` | Mifflin-St Jeor (default) / Katch-McArdle (body_fat_pct 신뢰 시, P1-B) |
| `tdee_kcal` | user-service `recalculate` | bmr × ACTIVITY_MULTIPLIERS |
| `target_kcal` | **meal-plan-engine `calorie_adjuster.adjust_calories`** | goal_pace 분기 + NUTRITION_BOUNDS clamp (P1-C). user-service 측 `bio_profiles.target_kcal` 은 cached estimate (deprecated, 후속 chore 에서 null 저장). |
| `macro_targets` | **meal-plan-engine `macro_rebalancer.rebalance_macros`** | AMDR (IOM) + medications (GLP-1 force) + diet_type 반영. user-service 측 `calcMacroTargets` 는 cached placeholder (deprecated). |

**FE 표시 권장**:
- BMR/TDEE → `bio_profiles.bmr_kcal/tdee_kcal` (user-service SoT)
- target_kcal/macros → **식단 결과의 `daily_targets`** (engine SoT). `bio_profiles` 의 동일 필드는 fallback 만 (deprecated estimate).

**향후 cleanup**:
- CHORE-MEAL-TARGET-KCAL-SOT-002: user-service `recalculate` 가 target_kcal/macro_targets 을 null 저장 + `bio_profiles.target_kcal/macro_targets` 컬럼 drop migration + FE fallback chain 갱신.

### `final_out` 4 필드 invariant (IMPL-AI-002 교훈)

`pipeline.py` 의 모든 early-return 경로는 다음 4 필드를 **항상** set 해야 한다:

| 필드 | 타입 | 의미 |
|------|------|------|
| `mode` | `"llm"` \| `"standard"` | LLM 사용 여부 |
| `quota_exceeded` | `bool` | cost cap 또는 monthly kill switch 도달 |
| `ui_hint` | `str \| None` | FE 에서 사용자에게 보여줄 안내 ("LLM 일시 중단" 등) |
| `llm_provenance` | `dict` | model / prompt_hash / total_tokens / cost_usd |

LLM 실패·cost cap·kill switch 어떤 경로든 deterministic fallback 으로 fail-closed 해야 BFF/FE 가 성공·실패를 동일 schema 로 받는다.

```python
# ✅ 모든 early-return 경로에서 _build_final_out() 호출
def _build_final_out(meals, mode, quota_exceeded=False, ui_hint=None, llm_provenance=None):
    return {
        "meals": meals,
        "mode": mode,
        "quota_exceeded": quota_exceeded,
        "ui_hint": ui_hint,
        "llm_provenance": llm_provenance or {},
    }
```

## PHI 최소화

- 각 파이프라인 단계는 `phi_minimizer.py`로 필요 최소 건강 데이터만 수신.
- 전체 `bio_profiles` 객체 통째로 전달 금지 (spec.md § 5.7 참조).

### VCR cassette PHI redact (IMPL-AI-002 교훈)

`vcrpy` 의 `filter_headers` config 옵션은 **request 헤더에만 적용**된다. response 헤더는 `before_record_response` 콜백 (`_scrub_response`) 안에서 직접 dict 키를 마스킹해야 한다:

```python
# ✅ services/meal-plan-engine/tests/llm/conftest.py 패턴
_RESPONSE_HEADER_REDACT = (
    "openai-organization",
    "openai-project",
    "set-cookie",
    "cf-ray",
    "x-request-id",
)

def _scrub_response(response: dict[str, Any]) -> dict[str, Any]:
    headers = response.get("headers")
    if isinstance(headers, dict):
        for key in list(headers.keys()):
            if key.lower() in _RESPONSE_HEADER_REDACT:
                headers[key] = ["[REDACTED]"]
    # ... body scrub continues
    return response

# vcr 등록 시 양방향 콜백 명시
vcr_config = {
    "filter_headers": [...],          # request 측
    "before_record_response": _scrub_response,  # response 측
    "before_record_request": _scrub_request,
}
```

cassette 녹화 후 grep gate 5단 tier 로 검증:
- `kmu-[a-z0-9]+` (OpenAI org)
- `proj_[A-Za-z0-9]{20,}` (OpenAI project)
- `sk-[a-zA-Z0-9]{20,}` (API key)
- `Bearer\s+[A-Za-z0-9._-]{20,}`
- `eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}` (JWT)
- `__cf_bm=[A-Za-z0-9.-]{40,}` (Cloudflare bot session)

## 영양 데이터 표준화

- 이종 소스(USDA, Instacart, 수동)는 `nutrition_normalizer`로 공통 스키마 변환 후 사용.
- 원시 데이터 직접 계산 금지 (spec.md § 5.5 참조).

## 웨어러블 데이터 (Phase 2+)

- 6시간 이상 미동기화 시 해당 데이터 불신 → 보수적 기본값 (activity_level 1단계 하향).
- UI에 "건강 데이터 동기화 필요" 배지 표시.

## 필수 테스트 시나리오

모든 AI Engine 변경 시 통과 필수:

1. **기본 생성**: 건강한 30대 남성, moderate, Ronaldo → 합리적 매크로
2. **알레르기 대체**: 유제품+글루텐 알레르기, Paltrow → 알레르겐 0건
3. **극단적 감량**: BMI 35+, weight_loss → 칼로리 >= 1200kcal
4. **고활동량**: very active + muscle_gain → 단백질 >= 체중 x 2.0g
5. **GLP-1 모드**: GLP-1 사용자 → 단백질 >= 체중 x 2.0g, 칼로리 10% deficit
6. **비건 단백질**: 비건 + 고단백 → 식물성만으로 충족 확인
7. **7일 다양성**: 동일 레시피 3회 이상 반복 없음
8. **영양소 단위 검증**: USDA + Instacart 혼합 시 단위 변환 정확성
9. **PHI 최소화**: 각 단계에서 불필요 건강 필드 미전달 확인

## Observability — gate sub-reason 라벨링 (IMPL-AI-002 교훈)

LLM 파이프라인 gate 실패는 단일 metric 에 `gate` + `reason` 두 라벨을 동시 붙여 sub-reason 별 alert 가능하게 한다 (cardinality 폭발 없이):

```python
# ✅ packages/llm_metrics.py
def record_gate_failure(gate_num: int, reason: str, gate: str):
    """
    gate_num: 1, 2, 3, ...
    reason: "citation_excerpt_missing" | "duplicate_ids" | "schema_invalid" | ...
    gate: "gate1" | "gate2" | "gate3"
    """
    GATE_FAILURE_COUNTER.labels(gate=gate, reason=reason).inc()

# 호출 예시
record_gate_failure(2, reason="citation_excerpt_missing", gate="gate2")
record_gate_failure(2, reason="duplicate_ids", gate="gate2")
```

이렇게 라벨링하면 Prometheus 에서:
- `sum by (reason) (gate_failure_total{gate="gate2"})` → gate2 의 reason 분포
- alert: `gate_failure_total{reason="citation_excerpt_missing"} > 5` (지속 발생 시)

cardinality 안전 가이드라인:
- `reason` 은 **enum 처럼 폐쇄 집합** (10~20개 이하). 자유 문자열 절대 금지
- `user_id` / `prompt_hash` 등 high-cardinality 값은 metric label 에 넣지 않는다 (log 로만)
