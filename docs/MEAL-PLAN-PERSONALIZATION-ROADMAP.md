# Meal Plan Personalization Roadmap

> P0 (`meal-plan-engine` 신뢰성 정상화) → P1 (입력 확장) → P2 (LLM RAG) → P3 (CGM/적응 학습) 의 long-term 로드맵.
>
> **이 문서는 다른 세션에서 작업을 이어갈 때 첫 reference 다.** 시작 전 순서: (1) 본 문서 → (2) `docs/IMPLEMENTATION_LOG.md` 가장 최근 entry → (3) `/Users/junwon/.claude/plans/greedy-doodling-anchor.md` (현재 active plan).

---

## 1. Context — 왜 이 작업이 필요한가

`services/meal-plan-engine/src/engine/pipeline.py` 분석에서 발견한 5 가지 결정적 갭 ("광고는 personalized, 실제는 라운드로빈"):

1. `_build_weekly_plan` (L80-104) — `pool[day_idx % len(pool)]` 라운드로빈. 칼로리/매크로 타겟 매칭 로직 부재.
2. `daily_totals` (L296-310) — 매일 동일한 `target_kcal`/`macros` 박제. 실제 선택 레시피 합산이 아닌 **거짓 정보**.
3. `micronutrient_checker` 호출부 (L193-200) — `safe_recipes` 전체 합산을 1일 RDA 와 비교 → 거의 항상 PASS (결핍 알람 비활성).
4. `db/seeds/data/_ingredients.json` 237개 ingredient — `nutrition_per_100g = {}` 빈 객체.
5. 11명 셀럽 × 18개 recipe = 198 레시피 — nutrition 7필드만 (USDA 매핑 없음, micronutrient 부재, ±20-40% 정확도).

**목표**: 7-Layer 아키텍처로 정상화 — 같은 스펙의 두 사용자가 운동 여부에 따라 정확히 274 kcal · 단백질 80g 차이를 실제로 받는 단계.

---

## 2. 7-Layer Architecture

### Layer 0 — Input 확장 (personalization 은 측정에서 시작)
- 인체측정: 키, 몸무게, 나이, 성별, **체지방률(선택)**
- 활동: 직업 활동량 + **exercise_sessions[]** (type / freq / duration_min / intensity)
- 목표: 감량/유지/증량 + **goal_pace** (kg/week)
- 철학: vegetarian / vegan / pescatarian / halal / kosher / Mediterranean / DASH / low-carb / keto
- 제약: 알레르기, 불내성, 종교, 비선호, 예산, 조리시간
- 의학: 임신·수유, 만성질환(당뇨/CKD/심혈관), GLP-1 등 복용약 (**PHI**)

### Layer 1 — Energy Expenditure
- BMR 공식 분기:
  - 일반 (비만 포함) → **Mifflin–St Jeor** (비비만 82%, 비만 70% 정확)
  - 체지방률 입력 + lean → **Katch–McArdle**
- 활동계수: FAO/WHO/UNU PAL (1.40–2.40)
- 운동 EE 모델: `TDEE = BMR × PAL_base + Σ(MET × kg × hours)` (모델 B 권장)
- Wearable kcal: 절대값 신뢰 ❌, 추세만 ✓ (Apple Watch ±31%, Garmin ±42%)

### Layer 2 — 목표 칼로리 조정
- 감량: TDEE − 15~25% (최소 1200/1500 kcal, 주 0.5–1% 체중)
- Lean bulk: TDEE + 10~15% (주 0.25–0.5%)
- Recomp: maintenance ± 5%, 단백질 ≥ 2.2 g/kg
- GLP-1 보조: TDEE − 10% + 단백질 ≥ 2.0 g/kg (sarcopenia 방지)

### Layer 3 — Macro Distribution (단백질-우선)
- Protein: 비운동 0.8–1.2 / 운동+감량 1.4–1.8 / 저항+감량 1.8–2.4 / 증량 1.6–2.2 g/kg (ISSN)
- Fat: max(0.6 × kg, 20% TDEE) — 최소 호르몬 합성
- Carb: (target − protein_kcal − fat_kcal) / 4 — 최소 130 g (DRI RDA 뇌 글루코스)
- Fiber: ≥ 14 g/1000 kcal
- AMDR (IOM): Protein 10–35% / Fat 20–35% / Carb 45–65%

### Layer 4 — Micronutrient (1일 + 7일 평균)
- 18 nutrient (NIH ODS DRI 성인 19-50):
  - Macros 관련: fiber
  - Vit: A·C·D·E·K, B6, B12, folate
  - Mineral: Ca, Fe, Mg, Zn, K, P, Se, I
  - Lipid: omega3
- Sex override 8개 (Fe, Vit A, **Vit C**, Vit K, Mg, Zn, omega3, **Potassium** — NIH ODS male/female)
- 식단 철학별 risk:
  - Vegan: B12 / iodine / iron / choline / Vit D / calcium / omega3 / zinc (AND position)
  - Keto: fiber / Mg / K / Vit C
  - DASH: sodium 1500 mg cap

### Layer 5 — Constraint Layer (철학·제약·알레르기)
- 단순 필터 아닌 **포함/제외 + 대체 영양원 매핑**
- vegan B12 → fortified yeast / supplement
- iron non-heme → pair with Vit C (흡수율 ×2-3)
- omega-3 EPA/DHA (vegan) → algae oil

### Layer 6 — Optimization Engine (라운드로빈 폐기)
- **ILP (Integer Linear Programming) 권장 — OR-Tools CP-SAT** (결정성 `random_seed=42` + `num_search_workers=1`)
- 변수: `x[d, mt, i] ∈ {0,1}` (day × meal_type × recipe)
- 제약: 슬롯당 1, allergen=0, repeat ≤ max_repeats, kcal ∈ [target±100], protein ≥ required, fat ratio ∈ [0.20, 0.35]
- 목적: `λ_kcal·|gap| + λ_protein·shortfall + λ_macro·band + λ_variety·repeats`
- 200 recipes × 7 days × 4 slots < 1s 일반
- Timeout fallback: 라운드로빈 + variety_optimizer (production safety)

### Layer 7 — LLM 의 진짜 역할 (계산 ❌ / 큐레이션 ✓)
- **잘하는 것**: Narrative / Reranking / Substitution suggestion / Chat constraint elicitation
- **절대 금지**: 영양가 합산, RDA 판정, 알레르겐 매칭, 칼로리 deficit 계산
- citation 환각 차단 → **RAG (USDA FoodData Central + 검증 KB embedding)**
- GPT-4 standalone 62% / RAG 95%+ (iDISK 2.0 연구)

---

## 3. 신뢰성 약속 — 사용 출처

| Tier | 출처 | 사용 |
|------|------|------|
| **Primary** | USDA FoodData Central API, NIH Office of Dietary Supplements (DRI), IOM/NAS AMDR | recipe·ingredient nutrition / RDA 18개 |
| **Peer-reviewed** | PubMed RCT·meta (Mifflin–St Jeor 2024, Longland AJCN 2016, ZOE PREDICT) | 알고리즘 가중치 정당화 |
| **Validation** | indirect calorimetry vs equation 비교 | BMR 공식 선택 근거 |
| **금지** | LLM 생성 영양 수치, 블로그, marketing, 인플루언서 | 절대 ❌ |

**DB 레벨 강제**: `ingredients.nutrition_source CHECK ('usda_fdc','nih_ods','manual_verified')` + 백필 fail-closed (`process.exit(1)` if `NULL` count > 0).

---

## 4. 우선순위 + Task 분할

### CHORE-CONTENT-001 (Stacked PR-A) — **prerequisite**, P0 시작 전 필수

| Sub-task | PR | 상태 | 내용 |
|----------|------|------|------|
| `CHORE-CONTENT-001-a` | **#73 merged** | ✅ | Migration 0019 (nutrition_source CHECK 컬럼) + USDA FDC client (X-Api-Key header, SSRF guard, redact) + Ingredient/Recipe entities 확장 |
| `CHORE-CONTENT-001-b` | **#75 merged** | ✅ | `backfill-ingredient-nutrition.ts` 2-step CLI (review-only → CSV 검수 → apply, omega-3 4-component sum ALA+EPA+DPA+DHA) + SeedIngredient |
| `CHORE-CONTENT-001-c` | **#77 merged** | ✅ | `recompute-recipe-nutrition.ts` (mixed-source `.every()` filter + atomic UPDATE + fail-closed) + spec.md §3.1 + §5.5 sync (LLM 금지 명시) |

**다음 사용자 액션** (PR-A 시리즈 머지 완료 후 1회):
1. `tsx db/seeds/scripts/backfill-ingredient-nutrition.ts --review-only` → `review.csv` 생성 (~2-3분)
2. (수동) `db/seeds/scripts/review.csv` 의 `accepted_fdc_id` 컬럼 237개 검수
3. `tsx db/seeds/scripts/backfill-ingredient-nutrition.ts` → ingredients.nutrition_per_100g 채움
4. `tsx db/seeds/scripts/recompute-recipe-nutrition.ts` → recipes.nutrition 재계산

### P0 (Stacked PR-B/C/D) — meal-plan-engine 신뢰성 정상화

| Sub-task | Task ID | PR | 상태 | 내용 | Affected |
|----------|---------|------|------|------|----------|
| **P0.1** RDA + sex | `IMPL-MEAL-P0-RDA-001` | **#84 open** | ⏳ review | RDA 6→18 (NIH ODS), `_RDA_FEMALE_OVERRIDES` 8 항목 (Fe·Vit A·Vit C·Vit K·Mg·Zn·omega3·Potassium), `check_weekly_avg`, `pipeline.py` sex 전달, spec §5.3 sync | micronutrient_checker / pipeline / test / spec |
| **P0.2** Aggregator | `IMPL-MEAL-P0-AGG-001` | next | pending | `nutrition_aggregator.py` 신규 (`aggregate_day` + `aggregate_week`, `KNOWN_MICRO_KEYS` frozenset), `pipeline.py:193-200` 인라인 합산 제거 | nutrition_aggregator / pipeline / test |
| **P0.3** daily_totals 진짜값 | `IMPL-MEAL-P0-DT-001` (예정) | pending | pending | `pipeline.py:296-310` daily_totals → `aggregate_day(day_slots)` 실제 합산, `daily_targets` 신규 필드 (FE "목표 vs 실제" 표시), Pass1 cleanup, shared-types DailyTotalsSchema 확장, **Migration 0020** (`meal_plan_monthly_stats` MV redefine) | pipeline / shared-types / migration 0020 / analytics |
| **P0.4** ILP solver | `IMPL-MEAL-P0-ILP-001` (예정) | pending | pending | `plan_solver.py` 신규 (OR-Tools CP-SAT, deterministic seed=42 + num_workers=1), `pipeline.py` 의 라운드로빈 + variety_optimizer → ILP 교체 + timeout fallback, `requirements.txt` ortools, llm_metrics ilp_timeout 카운터 | plan_solver / pipeline / variety_optimizer (fallback only) / requirements / metrics / test |

### P1 — 입력 확장 (P0 완료 후)
- `bio_profiles` 스키마 확장 (`exercise_sessions[]`, `goal_pace`, `dietary_philosophy`, `body_fat_pct`)
- BMR 공식 분기 (Mifflin / Katch-McArdle) → `engine/bmr.py`
- Exercise EE 모델 B (PAL_base + Σ MET·hr)
- Dietary philosophy filter + 영양 보충 매핑 (vegan B12 등)

### P2 — LLM 강화 (P1 완료 후)
- LLM reranker 에 RAG 백엔드 (USDA FDC + 검증 KB embedding)
- RD (Registered Dietitian) review 큐 (임신·CKD·당뇨 자동 expert review)
- Wearable kcal ±20% 신뢰 구간 + weekly trend 보정

### P3 — 차세대 (P2 완료 후, 장기)
- CGM / PREDICT-style 개인 반응 학습 (premium tier)
- 만족도 피드백 루프 (사용자 reject → ILP 가중치 학습)

---

## 5. Stacked PR 운영 패턴 (PR-A 시리즈 회고)

PR-A 시리즈 (3 sub-PR + 3 log-SHA PR = 6 PR) 운영 효과:

✅ **HANDOFF 크기 제한 준수** (`.claude/rules/pipeline.md` 신규×1.5 + 수정×1.0 ≤ 5)
✅ **Codex implement 안정성** (각 sub-task 토큰 budget 안)
✅ **Review/QA 사이클 단순화**
✅ **Rebase auto 3-way merge** (PR-A2/A3 의 IMPL_LOG conflict 자동 해소)
⚠️ **docs(log) PR overhead** — PR 수 2배 (sub-PR + log-SHA-PR). PR-B 부터 squash merge 후 같은 PR 내 SHA 갱신 검토 권장

### 4가지 verdict 분류 (`.claude/rules/pipeline.md`)

| verdict | 의미 | 사용 사례 |
|---------|------|----------|
| `out_of_scope` | HANDOFF 스코프 외, 다른 라인에서 처리 | meal-plan-engine#test (pythonjsonlogger) fail |
| `plan_decided` | 위험 실재. 다음 sub-task 코드 레벨 mitigation + Plan 머지 순서 강제 | 사용 안 함 (PR-A 모두 즉시 fix) |
| `deferred_backlog` | 실제 위험. 본 HANDOFF DoD 외, backlog ticket 추적 | CHORE-MICRO-RATIO-CONSISTENCY |
| `accept` | finding 실제로 문제 아님 (default OK / 다른 layer 책임) | phi_minimizer 우회 (sex 는 비-PHI demographic) |

---

## 6. 후속 chore backlog

| Chore ID | 발견 위치 | 내용 |
|----------|-----------|------|
| `CHORE-MAIN-PYTHON-DEPS` | PR-A1 gate-implement | `gate-check.sh` 의 turbo `pnpm test` 가 system python 사용 → `pythonjsonlogger` 부재로 meal-plan-engine test fail. `.venv/bin/pytest` 강제 또는 turbo task env PATH prepend |
| `CHORE-MICRO-RATIO-CONSISTENCY` | PR-B1 Gemini r2 MEDIUM | `micronutrient_checker.py` 의 `if ratio < MIN_COMPLIANCE` (raw float) vs `compliance_pct = round(ratio, 2)` (display) 의미적 불일치. UI 70% 표시 + deficient 분류 → 사용자 혼란 |

---

## 7. Gemini CLI 0.42 fallback 데이터포인트 (누적 4/4)

| Task | codex r1 | Gemini r2 | finding |
|------|----------|-----------|---------|
| CHORE-CONTENT-001-a | PASS | HIGH+MEDIUM | Recipe.nutrition_source drift |
| CHORE-CONTENT-001-b | PASS | HIGH | omega3 PUFA→4-component sum |
| CHORE-CONTENT-001-c | **hallucination (4.6k tokens)** | 10/10 PASS | spec sync 통과 |
| IMPL-MEAL-P0-RDA-001 | HIGH (caller) | HIGH (NIH WebSearch) | both independent HIGH |

→ Gemini 0.42 `run_shell_command` + `google_web_search` + `grep_search` 조합이 외부 source 정확성 검증 (NIH ODS RDA, USDA nutrientId 등) 에 결정적. L2-extended (Codex 1 + Gemini 1) 패턴이 의료/외부 source 영역에 ROI 우수.

---

## 8. 다른 세션 시작 시 (첫 행동)

```bash
# 1. main 동기화
git checkout main && git pull origin main

# 2. 본 문서 + 최근 IMPL_LOG entry 확인
cat docs/MEAL-PLAN-PERSONALIZATION-ROADMAP.md   # 이 문서
tail -100 docs/IMPLEMENTATION_LOG.md            # 가장 최근 작업 상태

# 3. plan 파일 확인 (Claude active plan)
cat /Users/junwon/.claude/plans/greedy-doodling-anchor.md

# 4. PR 목록 확인
gh pr list --state open --search "meal-plan OR CHORE-CONTENT OR P0"

# 5. 다음 sub-task 결정 (위 §4 표 참조)
#    예: P0.2 시작 → IMPL-MEAL-P0-AGG-001
scripts/pipeline.sh IMPL-MEAL-P0-AGG-001 init
```

---

## 9. 핵심 참고 문서

- **이 문서**: `docs/MEAL-PLAN-PERSONALIZATION-ROADMAP.md`
- **active plan**: `/Users/junwon/.claude/plans/greedy-doodling-anchor.md` (CHORE-CONTENT-001 + P0 시리즈 plan)
- **현재 진행 상태**: `docs/IMPLEMENTATION_LOG.md` 끝 entry
- **운영 룰**: `.claude/rules/pipeline.md` (Stacked PR / HANDOFF 크기 / verdict 4분리 / L3 review fallback)
- **신뢰성 룰**: `.claude/rules/domain/ai-engine.md` (NUTRITION_BOUNDS, PHI 최소화, final_out invariant)
- **DB 룰**: `.claude/rules/database.md` (atomic UPDATE, CHECK constraint, migration 0-downtime)
- **각 PR의 LESSONS**: `pipeline/runs/<TASK-ID>/LESSONS.md` (Codex/Gemini review 결과 + rules 병합 대상)

### 외부 출처 (영양 표준)
- [NIH ODS DRI Tables](https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx)
- [USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide.html)
- [NASEM 2019 DRI for Sodium and Potassium](https://www.nationalacademies.org/read/25353)
- [IOM/NAS AMDR (Acceptable Macronutrient Distribution Range)](https://www.ncbi.nlm.nih.gov/books/NBK610333/)
- [ISSN Position Stand: Protein and Exercise](https://link.springer.com/article/10.1186/s12970-017-0177-8)

---

*Last updated: 2026-05-14 — PR-B1 (#84) 진행 중. 다음: P0.2 aggregator.*
