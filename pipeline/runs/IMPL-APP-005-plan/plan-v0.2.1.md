# IMPL-APP-005 · LLM 개인화 식단 E2E 가시성 — narrative / citations / mode 배지 (v0.2.1)

> 이 파일은 **실행 계획**이다. IMPL-AI-001 시리즈로 LLM 레이어(client·reranker·safety·metrics·28 tests)는 이미 완결됐지만, 그 산출물이 프론트엔드까지 도달하는 파이프가 끊겨 있어 **사용자가 LLM 개인화 효과를 전혀 체감할 수 없다**. 본 계획은 그 단절을 최소 변경으로 잇는 것이 목표다.
> v0.1 → v0.2 (Codex #1 + Gemini #1 1차 리뷰 반영) → v0.2.1 (Codex + Gemini 2차 검증 모두 PASS, 2026-04-23).
> 승인 후 Phase B 실행; Codex #2 는 -a+-b 구현 후 수행 (L3 rubric 2번째 Codex 슬롯).

## Changelog

- **v0.2.1 (2026-04-23)** — Codex #1-v2 + Gemini #1-v2 검증 통과 (둘 다 PASS, "ready to ship")
  - Gemini v0.2-LOW: overflow `+N` chip 에 스크린리더용 `aria-label="외 N개의 출처가 더 있습니다"` 추가
  - Codex v0.2-NEW: 없음
- **v0.2 (2026-04-23)** — Codex #1 + Gemini #1 피드백 반영
  - Codex-HIGH: `mode` single source of truth — top-level 만 노출, `llm_provenance` 는 response 에서 제거
  - Codex-MED: nullability 고정 — `narrative: string | null`, `citations: SourceRef[]` (mode=standard 일 때 `null`/`[]`)
  - Codex-MED: Sub-task -c 파일수 재정리 — `PlanNarrativeCard` inline, 별도 파일은 `CitationChipList.tsx` + `plan-detail.module.css` 둘만 신규
  - Codex-LOW: Citation enum + 라벨 매핑을 `packages/shared-types/src/enums/citation.ts` 로 승격 → sub-task -b 가 소유
  - Codex-LOW: `llm_provenance` response 노출 결정 종결 — 차단
  - Gemini-HIGH: standard fallback 카피 **재협상** — 불안 유발 방지를 위해 긍정 프레이밍 + info (warning 아님) banner 로 변경
  - Gemini-MED: citation enum 원문 대신 한국어 라벨 표시 (`셀럽 인터뷰` / `요리책` 등)
  - Gemini-LOW: `PlanNarrativeCard` 시각 차별화 — `var(--cb-surface-subtle)` + quote prefix
  - Gemini-LOW: aria-label 구체 문구 고정 (아래 Contract Definition 참조)
- v0.1 (2026-04-23) — 초안

---

## Context

### 문제

`services/meal-plan-engine`은 LLM rerank 후 `mode`, `narrative`, `citations`, `llm_provenance` 를 생성하지만 — **frontend가 이 필드들을 받을 schema가 없고, 받아도 렌더링할 UI가 없다.** 추가로 `sqs_consumer._build_candidate_pool()` 이 `RecipeSlot.nutrition` 을 drop하여 `micronutrient_checker` 가 빈 입력으로 돌고 있어, LLM 이 ranking 하는 후보 자체의 매크로 검증이 우회된다. 결과적으로 (a) 사용자는 plan detail에서 평범한 레시피 목록만 보게 되고, (b) 미량영양소 stage는 사실상 무력화된 상태다.

### 목표

사용자가 `/plans/[id]` 를 열었을 때 다음이 바로 눈에 들어와야 한다:
1. 모드 배지 (`LLM 개인화` / `기본 식단` — spec §5.8 mode 계약)
2. 각 일자 또는 각 슬롯에 대한 persona narrator 문장 1~2줄
3. 레시피 별 citation 칩 — 한국어 라벨 (`셀럽 인터뷰` / `요리책` / `임상 연구` / `농무부 데이터` / `국립보건원 기준`)로 표시 (원문 enum: celebrity_interview / cookbook / clinical_study / usda_db / nih_standard)
4. `mode="standard"` 일 때 info 배너 — **재협상 카피** (v0.2): `"자세한 맞춤 분석이 진행되는 동안, 먼저 추천 기본 식단을 확인해 보세요."` (Gemini-HIGH 반영). S11 원문 `"일시적인 지연으로 기본 식단을 제공합니다"` 은 불안 유발이 있어 폐기. LLM-DESIGN §S11 계약 업데이트는 -c 구현 커밋에 포함.

그리고 이 변경이 **실제 OpenAI 호출로 dev 환경에서 end-to-end 체감** 되어야 한다.

### Non-Goals (이번 태스크에서 건들지 않음)

- Elite tier → LLM mode BFF gating (G4) → `IMPL-APP-006` 로 분리
- `phi_access_logs` 단일 트랜잭션 audit 경로 (G5) → `IMPL-APP-007` 로 분리
- WebSocket Redis pub/sub fanout (G6) → 후순위 운영 과제
- VCR cassette E2E replay (G7) → IMPL-AI-001-f deferred 유지
- Regenerate 버튼·Safety sub-route UI (BFF는 존재, UI 소비자 없음) → 별도

### 비즈니스 제약 재확인

| 제약 | 수치 | 근거 |
|------|------|------|
| mode 플래그 강제 | `llm` 또는 `standard` | LLM-DESIGN §S11 / Gemini BS-03 |
| Citation 0 허용 불가 (mode=llm) | min_length=1 | LLM-DESIGN §S6 · Celebase_Proposal line 182 |
| standard 카피 (v0.2 재협상) | `"자세한 맞춤 분석이 진행되는 동안, 먼저 추천 기본 식단을 확인해 보세요."` | LLM-DESIGN §S11 업데이트 예정 |
| per-plan 비용 | ≤ $0.05 | 기존 `estimate_prompt_cost` gate 재사용 |

### 사용자 스코프 결정 (2026-04-23)

- **스코프**: G1(nutrition drop 버그) + G2(shared-types 확장) + G3(/plans/[id] 렌더링) 한정
- **LLM 플래그**: dev 에서만 `ENABLE_LLM_MEAL_PLANNER=True` + `OPENAI_API_KEY` 주입, staging/prod 는 off 유지

---

## Pre-mortem (왜 실패할 수 있는가)

| 위험 | 완화 |
|------|------|
| meal-plan-engine 이 `narrative`/`citations` 를 DB 에 저장은 하지만 API response 에 미노출 | HANDOFF -a 에서 `repositories/meal_plan_repository.py` `get_by_id()` 와 `routes/meal_plans.py` response serializer 를 실제 확인 후 schema 정합 |
| `MealPlanWireSchema` 에 Citation/Narrative 추가 시 BE response 의 실제 shape 과 불일치 → runtime Zod fail | -a 에서 BE Pydantic 모델을 먼저 확정 → -b 의 Zod schema 를 그 shape 그대로 미러링. 양방향 contract test 1건 추가 |
| dev 에서 ENABLE_LLM=True 로 켰는데 Safety Gate 가 매번 fallback → 실제 LLM 경로 검증 안 됨 | -d 에서 Playwright run 시 `/ws/meal-plans/.../status` 로그·`adjustments.llm_provenance.mode` DB 값 두 경로 모두 확인 |
| OpenAI 실호출로 $$ 누적 | dev 로컬 1회 성공 + VCR 녹화 고려(deferred). 자동 테스트는 mock 유지 |
| `RecipeSlot.nutrition` 복구 시 `micronutrient_checker` 가 경계 밖 값을 새로 발견해 기존 green path 가 red 로 전환 | -a 에서 nutrition 복구 직후 `micronutrient_checker` 에 로그 추가하고 기존 seed 데이터로 regression 돌려 확인 |

---

## 단계별 실행 계획

### Phase A — Plan 승인 & 리뷰

1. **Plan v0.1 작성 완료** (이 파일)
2. **Codex 리뷰 1회** — `pipeline/runs/IMPL-APP-005-plan/CODEX-REVIEW-1.md` (schema 계약·누락 필드·BE↔FE drift 관점)
3. **Gemini 리뷰 1회** — 동 경로 `GEMINI-REVIEW-1.md` (UX / 접근성 / mode="standard" 문구 / i18n 관점)
4. 리뷰 피드백 반영 → **v1.0 확정** → 하위 HANDOFF 전개

### Phase B — 하위 HANDOFF

| Sub-task | 범위 | 파일 수 산정 (신규×1.5 + 수정×1.0) | 선행 |
|----------|------|------|------|
| **IMPL-APP-005-a** | ① `sqs_consumer._build_candidate_pool` 에 `nutrition` propagate (G1) ② `repositories/meal_plan_repository.py` `get_by_id()` 가 per-slot `narrative`/`citations` 를 DB JSONB 에서 꺼내서 반환 ③ `routes/meal_plans.py` 의 GET response 에 top-level `mode` 노출 + per-meal `narrative`/`citations` 포함 (llm_provenance **비노출**) ④ Pydantic `GetMealPlanResponse` 모델 업데이트 ⑤ contract test 1건 + nutrition regression test 1건 | 수정 3 + 신규 1 = **4.5** | — |
| **IMPL-APP-005-b** | ① `packages/shared-types/src/enums/citation.ts` 신설 (CITATION_TYPES + CITATION_LABELS_KO) ② `packages/shared-types/src/schemas/meal-plans.ts` 에 `mode`/`narrative`/`citations` Zod 추가 (기존 `SourceRefSchema` 재사용) ③ barrel `index.ts` export 추가 ④ BFF `/api/meal-plans/[id]/route.ts` 는 schema 통과만 확인 (코드 수정 없음 — 검증만) | 수정 2 + 신규 1 = **3.5** | -a |
| **IMPL-APP-005-c** | ① `apps/web/src/app/(app)/plans/[id]/page.tsx` 확장 — 모드 배지 + PlanNarrativeCard **inline** (별도 파일 아님) + standard banner ② `apps/web/src/app/(app)/plans/[id]/CitationChipList.tsx` 신규 (한국어 라벨은 shared-types 에서 import) ③ `apps/web/src/app/(app)/plans/[id]/plan-detail.module.css` 신규 — `--cb-surface-subtle` 등 토큰만, raw hex 금지 | 수정 1 + 신규 2 = **4.0** | -b |
| **IMPL-APP-005-d** | ① `.env.example` 에 `ENABLE_LLM_MEAL_PLANNER` + `OPENAI_API_KEY` placeholder 기입 (secret 커밋 금지) ② `docker-compose.override.yml` 의 `meal-plan-engine` 에 환경변수 주석 추가 ③ Playwright MCP E2E 1건 — 로그인 → 온보딩 → 셀럽 선택 → `/plans/new` → 완료 후 `/plans/[id]` 에 narrative + citation + `LLM 개인화` 배지 표시 + standard fallback fixture 로 info banner 렌더 확인 | 수정 2 + 신규 1(E2E spec) = **3.5** | -c |

각 HANDOFF 는 `.claude/rules/pipeline.md` "5파일 이하" 규칙 엄수 (위 산정치 모두 ≤5). Python 은 4 권장 기준 -a 4.5 로 살짝 초과 → contract test 를 repository 같은 파일의 기존 test module 에 병합하면 4.0 로 안착 (-a HANDOFF 작성 시점에서 확정).

---

## Critical Files

### 재사용 (수정 없이 import 만)

- `services/meal-plan-engine/src/engine/pipeline.py:210-232` — LLM reranker 분기 (`mode` 결정 원천)
- `services/meal-plan-engine/src/engine/llm_schema.py` — `Citation`, `LlmRankedMeal`, `LlmRankedMealList` Pydantic
- `services/meal-plan-engine/src/engine/llm_reranker.py` — `LlmRerankResult.mode` 반환 형태
- `packages/shared-types/src/jsonb/index.ts:83-89` — `SourceRefSchema` (Citation 확장 시 기반)
- `apps/web/src/lib/useMealPlanStream.ts` — WS progress 기존 구현 유지
- `apps/web/src/app/api/meal-plans/[id]/route.ts` — BFF GET 통로 (수정 예정 없음)

### 수정 대상 (sub-task 별)

- `services/meal-plan-engine/src/consumers/sqs_consumer.py:43-91` — RecipeSlot nutrition drop 버그 (G1)
- `services/meal-plan-engine/src/repositories/meal_plan_repository.py` — `get_by_id` 가 per-slot `narrative`/`citations` 를 JSONB 에서 꺼내서 반환 (llm_provenance 는 내부 보존, response 미노출)
- `services/meal-plan-engine/src/routes/meal_plans.py` — GET response Pydantic model 에 top-level `mode` + per-meal `narrative`/`citations` 노출 (llm_provenance exclude)
- `packages/shared-types/src/schemas/meal-plans.ts:29-46` — `MealPlanWireSchema` 확장
- `packages/shared-types/src/index.ts` — enums/citation barrel export 추가
- `apps/web/src/app/(app)/plans/[id]/page.tsx:94-129` — mode badge + narrative (inline JSX) + CitationChipList + standard banner

### 신규 생성

- `packages/shared-types/src/enums/citation.ts` (CITATION_TYPES + CITATION_LABELS_KO)
- `apps/web/src/app/(app)/plans/[id]/CitationChipList.tsx` (FE-local, ui-kit 승격 보류)
- `apps/web/src/app/(app)/plans/[id]/plan-detail.module.css` — `--cb-surface-subtle` 토큰 기반
- `pipeline/runs/IMPL-APP-005-plan/CODEX-REVIEW-1.md` / `GEMINI-REVIEW-1.md` (승인 직후 commit)
- 각 sub-task 별 `pipeline/runs/IMPL-APP-005-{a,b,c,d}/CODEX-HANDOFF.md`

**주의**: `PlanNarrativeCard.tsx` 는 파일 수 절감을 위해 `page.tsx` 내부 inline 컴포넌트로 유지 (Codex-MED). 재사용 지점이 생기면 그 때 `packages/ui-kit/` 으로 승격.

### 금지 경로 (건드리면 Plan 위반)

- `services/meal-plan-engine/src/engine/llm_*.py` — 기존 LLM 레이어 계약 변경 금지 (reranker 반환값·safety gate 순서 불변)
- `services/user-service/**`, `services/commerce-service/**` — 스코프 외
- `db/migrations/**` — 새 migration 없음 (`adjustments JSONB` 기존 컬럼만 사용). 새 컬럼 필요 시 plan v1.1 로 올려 재리뷰

---

## Contract Definition (BE ↔ FE drift 방지용)

### `GET /meal-plans/{id}` response shape (-a 에서 확정)

**Single source of truth**: `mode` 는 top-level 하나만 노출. `adjustments.llm_provenance` 는 response 에서 완전히 제거 (BE 내부 감사용 JSONB 보존, serializer 에서 `exclude`). Codex-HIGH 반영.

```jsonc
{
  "id": "uuid-v7",
  "status": "completed",
  "mode": "llm",                           // "llm" | "standard" — canonical
  "start_date": "2026-04-24",
  "end_date": "2026-04-30",
  "daily_plans": [
    {
      "date": "2026-04-24",
      "meals": [
        {
          "meal_type": "breakfast",
          "recipe_id": "uuid-v7",
          "title": "…",
          "narrative": "이 오트밀은 호날두의 경기 전 탄수화물 루틴과 …",  // string | null
          "citations": [                                                   // SourceRef[] (mode=llm: min 1, mode=standard: [])
            { "type": "celebrity_interview", "source": "GQ 2023", "url": null },
            { "type": "usda_db", "source": "USDA FoodData Central #1234", "url": "…" }
          ]
        }
      ]
    }
  ]
}
```

### Nullability 규칙 (Codex-MED 반영, 엄격 고정)

| 필드 | `mode="llm"` | `mode="standard"` | Pydantic | Zod |
|------|--------------|------------------|----------|-----|
| `narrative` | `string` (non-empty) | `null` | `str \| None` | `z.string().min(1).nullable()` |
| `citations` | `SourceRef[]` length≥1 | `[]` | `list[SourceRef]` default_factory=list | `z.array(SourceRefSchema).default([])` |
| `mode` | `"llm"` | `"standard"` | `Literal["llm","standard"]` | `z.enum(["llm","standard"])` |

Contract test 1건: `tests/integration/test_meal_plan_get_contract.py` — fixture 두 종 (mode=llm, mode=standard) 으로 response shape 을 Pydantic 모델 round-trip + Zod fixture JSON snapshot 양방향 검증. -a 에서 추가.

### Citation enum — shared-types 승격 (Codex-LOW 반영)

`packages/shared-types/src/enums/citation.ts` 를 신설하고 양쪽에서 import:

```typescript
// packages/shared-types/src/enums/citation.ts
export const CITATION_TYPES = [
  'celebrity_interview',
  'cookbook',
  'clinical_study',
  'usda_db',
  'nih_standard',
] as const;
export type CitationType = typeof CITATION_TYPES[number];

// 한국어 라벨 — FE 렌더 전용 (Gemini-MED 반영)
export const CITATION_LABELS_KO: Record<CitationType, string> = {
  celebrity_interview: '셀럽 인터뷰',
  cookbook: '요리책',
  clinical_study: '임상 연구',
  usda_db: '농무부(USDA) 데이터',
  nih_standard: '국립보건원(NIH) 기준',
};
```

Python 쪽은 `services/meal-plan-engine/src/engine/llm_schema.py` 의 기존 `Citation.type: Literal[...]` 5-value literal 과 정합. enum 추가 시 shared-types + llm_schema 양쪽 동시 수정 (sub-task -b 오너).

### 접근성 카피 고정 (Gemini-LOW 반영)

- Mode badge `LLM 개인화`: `aria-label="LLM AI로 개인화된 식단입니다."`
- Mode badge `기본 식단`: `aria-label="추천 기본 식단입니다."`
- Citation chip list: `role="list"` + 각 chip `role="listitem"`, chip 자체는 button 아닌 정적 text (클릭 상호작용 없음)
- Citation overflow `+N` chip: `aria-label="외 N개의 출처가 더 있습니다."` (Gemini v0.2 LOW 반영 — N 은 실제 숫자 삽입)
- Standard mode banner: `role="status"` + `aria-live="polite"` (info 레벨)

---

## Verification (end-to-end)

### Plan 단계 (v1.0 확정 전)

- Codex 리뷰 의견 — `CODEX-REVIEW-1.md` 5개 항목에 대해 PASS or 정당화
- Gemini 리뷰 의견 — `GEMINI-REVIEW-1.md` 5개 항목에 대해 PASS or 정당화
- v1.0 commit SHA 가 `docs/IMPLEMENTATION_LOG.md` 에 기록 (2-commit 패턴 준수)

### Sub-task 별 (각 HANDOFF 완료 시)

1. `pnpm --filter shared-types build` + `pnpm --filter web typecheck` + `pnpm --filter web lint` 통과
2. `python -m pytest services/meal-plan-engine/tests/unit/ services/meal-plan-engine/tests/integration/` 기존 28 + 신규 2~3 건 (contract + nutrition regression) 전부 PASS
3. `scripts/gate-check.sh all` — Semgrep high/critical=0, fe_token_hardcode pass, fe_slice_smoke (해당 시) pass
4. `scripts/gate-check.sh sql_schema` — 새 migration 없음 확인

### E2E (IMPL-APP-005-d 최종)

- dev compose 기동: user-service + content-service + meal-plan-engine (`ENABLE_LLM_MEAL_PLANNER=True`) + LocalStack + Redis + web
- Playwright MCP 시나리오 1:
  1. `/signup` → 신규 유저 생성
  2. 온보딩 4 step 완주 → bio-profile POST 200
  3. `/celebrities/ronaldo` → Generate CTA
  4. `/plans/new` → WS progress 100% → `/plans/{id}` 자동 이동
  5. 상단 배지 `LLM 개인화` 가시, 각 meal 에 `narrative` 1~2 줄 렌더, 레시피당 citation chip 최소 1개
  6. 콘솔 에러 0, 네트워크 에러 0
- 실패 시 `adjustments.llm_provenance.mode` DB 값과 `meal-plan-engine.log` 의 `llm_reranker` 라인을 교차 확인해 fallback 이유 식별

### 릴리즈 gate (dev 한정)

- `LLM_ROLLOUT_PCT=100` 인 상태의 dev 환경에서 연속 3회 생성 모두 `mode="llm"` 이면 체감 테스트 합격
- `standard` fallback 이 한 번이라도 나오면 원인 분석 후 v1.1 재리뷰

---

## Review Tier

- **Tier**: **L3** (외부 API 실호출 + 여러 서비스 동시 수정: meal-plan-engine BE + shared-types + apps/web FE). PHI 형상 변경 없음, DB migration 없음 → L4 까진 안 감.
- **Review plan**: Codex ×2 + Gemini ×1, 시리즈 전체에 분산
  - Codex #1 — Plan v0.1 (본 파일) 설계 완전성 · BE↔FE contract drift · 버그 리스크
  - Codex #2 — -a + -b 구현 후 (BE response shape ↔ FE Zod schema 정합)
  - Gemini #1 — -c 구현 후 UX/접근성 + mode=standard 문구 계약 + narrative 없을 때 레이아웃 붕괴 여부
- **Escalation trigger**: PGE 루프 3회 초과 시 `ESCALATE_TO_HUMAN` + `pipeline-log.jsonl` 기록

---

## Open Questions — v0.2 에서 종결

- ~~Citation 소스 type 이 5개로 충분한가?~~ → **5개 고정** (LLM-DESIGN §S6 그대로). 추가 시 shared-types enum + llm_schema literal 양쪽 동시 수정 계약.
- ~~PlanNarrativeCard ui-kit 승격?~~ → **inline 유지** (Codex-MED). 재사용 지점 생기면 그 때 승격.
- ~~standard banner 한국어/영어?~~ → **한국어만** (현 locale).
- ~~llm_provenance response 노출?~~ → **비노출** (Codex-HIGH). top-level `mode` 만 canonical. llm_provenance 는 DB JSONB 내부 감사용.
- ~~nutrition 복구 후 micronutrient_checker regression?~~ → -a regression test 필수 (아래 Verification §).
- ~~standard 카피 유지 vs 재협상?~~ → **재협상 확정** (Gemini-HIGH). 새 카피: `"자세한 맞춤 분석이 진행되는 동안, 먼저 추천 기본 식단을 확인해 보세요."`. LLM-DESIGN §S11 업데이트는 -c PR commit 에 포함.

### 아직 열려있는 질문 (Codex #2 또는 사용자 판단 필요)

- citation chip overflow `+N` 클릭 시 모달/툴팁? → 일단 **정적 `+N` label, 클릭 불가** (a11y 단순화). UX 요청 나오면 후속.
- E2E 에서 OpenAI 실호출 $$ 상한 → dev 로컬 1회 + `LLM_ROLLOUT_PCT=100` 3회 연속 확인. 초과 시 VCR 도입 (IMPL-AI-001-f deferred 유지).

---

## Next Action

1. 이 **v0.2 plan** 에 대해 ExitPlanMode → 사용자 승인
2. 승인 직후:
   - `pipeline/runs/IMPL-APP-005-plan/` 디렉토리 생성 → Codex/Gemini 리뷰 원문을 `CODEX-REVIEW-1.md` / `GEMINI-REVIEW-1.md` 로 커밋
   - 이 plan 파일을 `pipeline/runs/IMPL-APP-005-plan/plan-v0.2.md` 로 사본 보관
3. Phase B 순차 실행: IMPL-APP-005-a (BE) → -b (shared-types) → -c (FE) → -d (E2E)
4. -a+-b 완료 시점에 Codex #2 리뷰 (BE↔FE contract 정합) — 이는 리뷰 tier L3 rubric 의 2번째 Codex 슬롯
