# CODEX-HANDOFF — IMPL-APP-005-a
## BE: nutrition propagate (G1) + mode/narrative/citations 노출

**Parent plan**: `pipeline/runs/IMPL-APP-005-plan/plan-v0.2.1.md`
**Review tier**: L3 (이 sub-task 는 Codex #2 in -b 이후 리뷰 예정, -a 단독 리뷰 없음)
**Working directory**: repo root (meal-plan-engine Python service)

---

## Background

`services/meal-plan-engine` 의 LLM reranker는 이미 `mode`, `narrative`, `citations`, `llm_provenance` 를
생성하지만 두 가지 이유로 사용자가 체감하지 못한다:

1. **G1 버그**: `sqs_consumer._build_candidate_pool()` 이 `RecipeSlot` 을 생성할 때 `nutrition` 필드를 drop.
   → `micronutrient_checker` 가 빈 입력으로 동작하여 영양소 단계가 사실상 무력화.
2. **DB 저장 누락**: `sqs_consumer._process_message()` 가 `adjustments` 에 `target_kcal`/`macros` 만 저장.
   `mode`, `llm_provenance` 가 DB에 안 들어가므로 GET 응답에도 없음.
3. **GET 응답 미가공**: `routes/meal_plans.py` `get_meal_plan` 이 raw DB row 를 반환.
   - `mode` 가 top-level 없음 (adjustments JSONB 안에만 있게 될 것)
   - `adjustments.llm_provenance` 가 그대로 노출될 수 있음 (보안 — 내부 감사용 필드)

---

## Requirements

### R1 — RecipeSlot nutrition 필드 추가 (allergen_filter.py)
- `RecipeSlot` dataclass 에 `nutrition: dict | None = None` 필드 추가
- 타입 힌트: `Optional[Dict[str, Any]]`, default `None`

### R2 — _build_candidate_pool nutrition propagate (sqs_consumer.py)
- `_build_candidate_pool(recipes)` 에서 `RecipeSlot` 생성 시 `nutrition=r.get("nutrition")` 전달
- 기존 4개 필드 (`recipe_id`, `meal_type`, `allergens`, `ingredients`) 유지

### R3 — adjustments 에 mode + llm_provenance 저장 (sqs_consumer.py)
- `_process_message()` 의 `repo.update_meal_plan` 호출에서 `adjustments` 에 `mode`, `llm_provenance`, `ui_hint` 추가:

```python
"adjustments": {
    "target_kcal": result.get("target_kcal"),
    "macros": result.get("macros"),
    "mode": result.get("mode", "standard"),
    "llm_provenance": result.get("llm_provenance"),  # None 이면 omit
    "ui_hint": result.get("ui_hint"),
},
```

### R4 — GET /meal-plans/{id} response serializer (routes/meal_plans.py)
`get_meal_plan` 라우터가 raw row 대신 아래 contract 를 반환하도록 `_serialize_meal_plan_row()` helper 추가:

**반환 계약 (plan v0.2.1 Contract Definition 확정)**:
```python
def _serialize_meal_plan_row(row: dict) -> dict:
    adj = row.get("adjustments") or {}
    mode = adj.get("mode", "standard")
    daily_plans_raw = row.get("daily_plans") or []

    # daily_plans 가 JSON string 으로 저장된 경우 파싱
    if isinstance(daily_plans_raw, str):
        import json as _json
        daily_plans_raw = _json.loads(daily_plans_raw)

    return {
        "id": str(row["id"]),
        "status": row["status"],
        "mode": mode,                    # top-level canonical
        "start_date": str(row["start_date"]) if row.get("start_date") else None,
        "end_date": str(row["end_date"]) if row.get("end_date") else None,
        "daily_plans": [
            {
                "day": day.get("day"),
                "date": day.get("date"),
                "meals": [
                    {
                        "meal_type": meal.get("meal_type"),
                        "recipe_id": meal.get("recipe_id"),
                        "narrative": meal.get("narrative"),       # str | None
                        "citations": meal.get("citations") or [], # list[dict]
                    }
                    for meal in (day.get("meals") or [])
                ],
                "daily_totals": day.get("daily_totals"),
            }
            for day in daily_plans_raw
        ],
        # llm_provenance 는 내부 감사용 — response 에서 제거
    }
```

`get_meal_plan` 라우터에서:
```python
row = await repo.get_meal_plan(pool, plan_id, user_id)
if row is None:
    ...
return _serialize_meal_plan_row(row)
```

### R5 — Contract test (tests/integration/test_meal_plan_get_contract.py)
두 fixture (mode="llm", mode="standard") 로 `_serialize_meal_plan_row()` 의 output shape 을 검증:

```python
# mode=llm fixture: narrative non-null, citations len>=1
# mode=standard fixture: narrative is None, citations == []
```

검증 항목:
- `mode` 가 top-level 에 있고 `"llm"` 또는 `"standard"`
- `daily_plans` 내 각 meal 에 `narrative`, `citations` 키 존재
- `mode="llm"` 시 `citations` 길이 ≥ 1, `narrative` is not None
- `mode="standard"` 시 `citations == []`, `narrative is None`
- `adjustments` 또는 `llm_provenance` 키가 top-level response 에 없음

### R6 — Nutrition regression test (tests/unit/test_engine.py 또는 test_meal_plan_routes.py 에 추가)
`_build_candidate_pool` 호출 후 반환된 RecipeSlot 에 nutrition 값이 보존되는지 단위 테스트 1건:

```python
# recipe dict 에 nutrition 필드 있을 때 RecipeSlot.nutrition 에 전달 확인
# recipe dict 에 nutrition 없을 때 RecipeSlot.nutrition is None 확인
```

---

## Affected Paths

```
services/meal-plan-engine/src/engine/allergen_filter.py       # R1
services/meal-plan-engine/src/consumers/sqs_consumer.py       # R2, R3
services/meal-plan-engine/src/routes/meal_plans.py            # R4
services/meal-plan-engine/tests/integration/test_meal_plan_get_contract.py  # R5 (신규)
```

nutrition regression test 는 기존 `tests/unit/test_engine.py` 에 append (파일 수 절감).
총 신규 1 × 1.5 + 수정 3 × 1.0 = **4.5** ≤ 5 ✅

---

## DDL Inline (DB Schema)

```sql
-- db/migrations/ 에서 발췌 — meal_plans 테이블
CREATE TABLE meal_plans (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id       uuid NOT NULL,
    base_diet_id  uuid NOT NULL,
    status        text NOT NULL DEFAULT 'queued',
    daily_plans   jsonb NOT NULL DEFAULT '[]',
    adjustments   jsonb NOT NULL DEFAULT '{}',
    preferences   jsonb NOT NULL DEFAULT '{}',
    name          text,
    start_date    date,
    end_date      date,
    idempotency_key text,
    created_at    timestamptz NOT NULL DEFAULT NOW(),
    updated_at    timestamptz NOT NULL DEFAULT NOW(),
    deleted_at    timestamptz
);
```

`mode` 는 별도 컬럼이 아닌 `adjustments JSONB` 안에 저장 (`adjustments.mode`).
`daily_plans JSONB` 구조 (pipeline.py weekly_plan output):
```jsonc
[
  {
    "day": 1, "date": "2026-04-24",
    "meals": [
      {
        "meal_type": "breakfast",
        "recipe_id": "uuid",
        "rank": 1,
        "narrative": "...",   // mode=standard 때 null
        "citations": [...]    // mode=standard 때 []
      }
    ],
    "daily_totals": { "calories": 2000, "protein_g": 150, "carbs_g": 200, "fat_g": 70 }
  }
]
```

---

## Anti-Patterns

- **`import json` 중복**: 파일 내 이미 `import json` 있으면 router 함수 내 `import json as _json` 로컬 임포트 불필요 — 상단 import 활용.
- **adjustments JSON 타입**: `asyncpg` 는 JSONB 컬럼을 Python dict 로 자동 파싱함. `json.loads(row["adjustments"])` 추가 파싱 금지.
- **daily_plans JSON 타입**: 위와 동일. asyncpg 자동 파싱 — 이중 파싱 금지.
  단, mock/fixture 에서 string 으로 오는 경우 방어 처리 (R4 코드 참조).
- **pino API 순서 (Python logger)**: `_logger.info("plan=%s generation completed", plan_id)` 패턴 유지 — format string 먼저.
- **`Optional` 임포트**: `from typing import Optional, Dict, Any` — Python 3.10 미만 호환 필요 시 `Dict[str, Any]` 사용.

---

## Acceptance Criteria

- [ ] `python -m pytest services/meal-plan-engine/tests/unit/test_engine.py -k "nutrition"` PASS (nutrition regression)
- [ ] `python -m pytest services/meal-plan-engine/tests/integration/test_meal_plan_get_contract.py` PASS (2 scenarios)
- [ ] `python -m pytest services/meal-plan-engine/tests/` 기존 28건 포함 전체 PASS (regression 없음)
- [ ] `RecipeSlot` 에 `nutrition` 필드 존재 확인 (`grep "nutrition" services/meal-plan-engine/src/engine/allergen_filter.py`)
- [ ] `adjustments` 저장 코드에 `"mode"` 키 존재 (`grep "mode" services/meal-plan-engine/src/consumers/sqs_consumer.py`)
- [ ] `_serialize_meal_plan_row` 함수가 routes/meal_plans.py 에 존재 및 `llm_provenance` 키 미포함 확인
- [ ] `ruff check services/meal-plan-engine/` 경고 0

---

## Reference

- Plan: `pipeline/runs/IMPL-APP-005-plan/plan-v0.2.1.md`
- spec.md §5.8 (LLM mode 계약), §5.3 (AllergenFilter)
- `services/meal-plan-engine/src/engine/pipeline.py:250-305` — `result` dict 구조 (final_out)
- `services/meal-plan-engine/src/engine/llm_schema.py` — `Citation`, `LlmProvenance`, `LlmRerankResult`
- `.claude/rules/pipeline.md` — HANDOFF Anti-Patterns (TypeScript 항목은 FE 전용, Python 무시)
