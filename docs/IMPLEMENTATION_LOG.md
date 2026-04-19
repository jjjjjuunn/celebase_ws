# Implementation Log

> 이 파일은 append-only로 관리합니다. 기존 엔트리를 수정하거나 삭제하지 마세요.
> 각 엔트리는 아래 YAML front-matter 스키마를 따릅니다.

<!--
엔트리 스키마:
---
date: YYYY-MM-DD
agent: <모델 식별자> (예: claude-sonnet-4-6, human)
task_id: <tasks.yaml의 태스크 ID> (예: BOOT-001)
commit_sha: <커밋 해시 7자리 이상>
files_changed:
  - <파일 경로>
verified_by: <human | codex-review | 기타 검증자>
---
### 완료: [구현 내용]
### 미완료: [남은 작업]
### 연관 파일: [관련 경로]

필수 필드: date, agent, task_id, commit_sha, verified_by
-->

---

## Entries

<!-- 새 엔트리는 이 줄 아래에 추가 -->

---
date: 2026-04-18
agent: claude-sonnet-4-6
task_id: IMPL-APP-001b-1a
commit_sha: cd3ad9f
files_changed:
  - apps/web/src/app/api/_lib/error.ts
  - apps/web/src/app/api/_lib/session.ts
  - apps/web/src/app/api/_lib/bff-fetch.ts
  - apps/web/package.json
verified_by: claude-sonnet-4-6
---
### 완료: BFF 기초 공사 — error/session/bff-fetch (IMPL-APP-001b-1a)
- error.ts: BffError 인터페이스, PHI_REDACT_PATHS(19개), Pino logger, toBffErrorResponse (allowlist 필터 + ZodError 502 + INTERNAL_ERROR 500)
- session.ts: Cognito RS256 JWKS 검증, createProtectedRoute/createPublicRoute factory, JWTExpired → X-Token-Expired header
- bff-fetch.ts: 절대 throw 없는 Result<T> 반환, 1MB 응답 cap, 토큰 버킷 rate limit (public 60/min, auth 20/min), Zod safeParse 502 위임
- Codex heredoc 실패 → Claude 직접 구현 (pipeline.md 하이브리드 분업 규칙)
- zod@^3.24.1 apps/web 의존성 추가 (HANDOFF 누락분)
### 미완료: session/error 단위 테스트, ESLint protected-route-factory 룰 (→ IMPL-APP-001b-1b)
### 연관 파일: apps/web/src/app/api/_lib/error.ts, session.ts, bff-fetch.ts

---
date: 2026-04-12
agent: claude-sonnet-4-6
task_id: IMPL-004-b
commit_sha: d86ed35
files_changed:
  - services/meal-plan-engine/src/engine/__init__.py
  - services/meal-plan-engine/src/engine/calorie_adjuster.py
  - services/meal-plan-engine/src/engine/macro_rebalancer.py
  - services/meal-plan-engine/src/engine/allergen_filter.py
  - services/meal-plan-engine/src/engine/micronutrient_checker.py
  - services/meal-plan-engine/src/engine/variety_optimizer.py
  - services/meal-plan-engine/src/engine/nutrition_normalizer.py
  - services/meal-plan-engine/src/engine/phi_minimizer.py
  - AGENTS.md
verified_by: claude-sonnet-4-6
---
### 완료: meal-plan-engine AI 파이프라인 7개 리프 모듈
- calorie_adjuster: TDEE × goal_factor, [1200,5000] 클램핑, athletic_performance+very_active → 1.25
- macro_rebalancer: MAX(activity_base, goal_minimum), protein_g clamp [0.8,3.0] g/kg, min_carb_g=50
- allergen_filter: blocked_allergens 교집합 레시피 → candidate 대체, 불가 시 UNAVAILABLE 슬롯
- micronutrient_checker: RDA 대비 70% 미만 영양소 탐지 + 보충제 권고
- variety_optimizer: 7일 내 동일 레시피 최대 2회 반복 제한
- nutrition_normalizer: IU↔µg 단위 변환, USDA/Instacart 공통 스키마 변환
- phi_minimizer: TASK_FIELD_MAP 기반 최소 PHI 추출, 알 수 없는 task → 빈 dict
- ai-engine.md 7개 필수 시나리오 모두 검증 (S2~S9, S6 제외)
- ruff 0 errors, 8 기존 CRUD tests PASS
- AGENTS.md 신규: Codex 자동 로드 인스트럭션 (Python heredoc 방식)
### 미완료: pipeline.py 오케스트레이터, 엔진 단위 테스트, SQS+WebSocket (IMPL-004-c)
### 연관 파일: services/meal-plan-engine/src/engine/, AGENTS.md, CODEX-INSTRUCTIONS.md

---
date: 2026-04-12
agent: claude-opus-4-6 + codex-o3
task_id: IMPL-004-c
commit_sha: a2529a4
files_changed:
  - services/meal-plan-engine/src/engine/pipeline.py
  - services/meal-plan-engine/src/repositories/meal_plan_repository.py
  - services/meal-plan-engine/src/consumers/sqs_consumer.py
  - services/meal-plan-engine/src/api/websocket.py
  - services/meal-plan-engine/src/clients/content_client.py
  - services/meal-plan-engine/src/clients/user_client.py
  - services/meal-plan-engine/tests/unit/test_engine.py
  - services/meal-plan-engine/tests/conftest.py
  - services/meal-plan-engine/src/api/__init__.py
  - services/meal-plan-engine/src/clients/__init__.py
  - services/meal-plan-engine/src/consumers/__init__.py
  - services/meal-plan-engine/src/engine/__init__.py
verified_by: codex-o3-review + claude-opus-4-6
---
### 완료: meal-plan-engine 파이프라인 오케스트레이터 + 인프라
- pipeline.py: Two-Pass 오케스트레이터 (Pass 1: calorie+allergen 초안, Pass 2: 전체 7모듈)
- meal_plan_repository.py: asyncpg CRUD 5함수 (create, get, list, update, archive) — parameterized query, cursor pagination
- sqs_consumer.py: SQS polling loop (long-poll 20s, 1 auto-retry, DLQ on 2nd failure)
- websocket.py: FastAPI WebSocket at /ws/meal-plans/{plan_id}/status — Redis 티켓 인증 (1회용, TTL 30s)
- content_client.py: httpx async client — get_base_diet(), get_recipes_for_diet() (cursor pagination)
- user_client.py: httpx async client — get_bio_profile() (auth token forwarding)
- test_engine.py: 9/9 ai-engine.md 시나리오 PASS
- 하이브리드 분업: Codex(pipeline.py + test_engine.py) + Claude(나머지 5파일)
- gate-implement PASS, gate-review PASS (조건부), gate-qa PASS
### 미완료: JWT 실제 구현 (IMPL-005), PHI 암호화 (IMPL-006), 통합 테스트
### 연관 파일: services/meal-plan-engine/src/, pipeline/runs/IMPL-004-c/

---
date: 2026-04-11
agent: claude-sonnet-4-6
task_id: IMPL-004-a
commit_sha: 2e2626a
files_changed:
  - services/meal-plan-engine/main.py
  - services/meal-plan-engine/requirements.txt
  - services/meal-plan-engine/.gitignore
  - services/meal-plan-engine/src/config.py
  - services/meal-plan-engine/src/database.py
  - services/meal-plan-engine/src/models/meal_plan.py
  - services/meal-plan-engine/src/repositories/meal_plan_repository.py
  - services/meal-plan-engine/src/routes/meal_plans.py
  - services/meal-plan-engine/tests/conftest.py
  - services/meal-plan-engine/tests/unit/test_meal_plan_routes.py
verified_by: claude-sonnet-4-6
---
### 완료: meal-plan-engine Python FastAPI 부트스트랩 + CRUD 엔드포인트
- TypeScript stub 완전 삭제 (index.ts, package.json, tsconfig.json)
- Python FastAPI 서비스: main.py lifespan, asyncpg pool, pydantic-settings config
- 6개 엔드포인트: POST /generate, GET /meal-plans, GET /:id, PATCH /:id, POST /:id/regenerate, DELETE /:id
- JWT stub (manual base64 decode, prod에서 Cognito JWKS 교체 예정)
- cursor pagination: id > cursor ORDER BY id ASC LIMIT limit+1
- error envelope: {"error": {"code": ..., "message": ..., "requestId": ...}}
- repository layer stubbed (NotImplementedError, real SQL comes in IMPL-004-b/c)
- 8 unit tests PASS, ruff 0 errors
### 미완료: AI 파이프라인(IMPL-004-b), SQS+WebSocket(IMPL-004-c)
### 연관 파일: services/meal-plan-engine/src/, services/meal-plan-engine/tests/

---
date: 2026-04-11
agent: claude-sonnet-4-6
task_id: IMPL-003
commit_sha: 1118314
files_changed:
  - services/content-service/src/index.ts
  - services/content-service/src/types.d.ts
  - services/content-service/src/repositories/celebrity.repository.ts
  - services/content-service/src/repositories/baseDiet.repository.ts
  - services/content-service/src/repositories/recipe.repository.ts
  - services/content-service/src/services/celebrity.service.ts
  - services/content-service/src/services/baseDiet.service.ts
  - services/content-service/src/services/recipe.service.ts
  - services/content-service/src/routes/celebrity.routes.ts
  - services/content-service/src/routes/baseDiet.routes.ts
  - services/content-service/src/routes/recipe.routes.ts
  - services/content-service/tests/unit/celebrity.service.test.ts
  - services/content-service/tests/unit/baseDiet.service.test.ts
  - services/content-service/tests/unit/recipe.service.test.ts
  - services/content-service/package.json
  - services/content-service/tsconfig.json
verified_by: claude-sonnet-4-6
---
### 완료: content-service route + repository + service 레이어
- repositories: celebrity(findBySlug, list with cursor), baseDiet(findById, findByCelebrityId), recipe(findById with JOIN, findByBaseDietId with cursor)
- services: getCelebrity/listCelebrities, getBaseDiet/listByCelebrity, getRecipe/listByBaseDiet/getPersonalized(allergen conflict detection)
- routes: GET /celebrities, GET /celebrities/:slug, GET /celebrities/:slug/diets, GET /base-diets/:id, GET /base-diets/:id/recipes, GET /recipes/:id, GET /recipes/:id/personalized
- cursor pagination: limit+1 pattern, has_next boolean, no COUNT(*), no OFFSET
- N+1 방지: recipe + recipe_ingredients + ingredients 단일 JOIN 쿼리 + assembleRecipe() null guard
- is_active = TRUE 모든 쿼리에 적용
- 16 unit tests PASS, 100% line coverage, typecheck 0 errors, lint 0 errors
### 미완료: meal-plan-engine (IMPL-004)
### 연관 파일: services/content-service/src/, services/content-service/tests/

---
date: 2026-04-10
agent: claude-opus-4-6
task_id: IMPL-002
commit_sha: 9288158
files_changed:
  - services/user-service/src/index.ts
  - services/user-service/src/types.d.ts
  - services/user-service/src/routes/user.routes.ts
  - services/user-service/src/routes/bio-profile.routes.ts
  - services/user-service/src/routes/ws-ticket.routes.ts
  - services/user-service/src/repositories/user.repository.ts
  - services/user-service/src/repositories/bio-profile.repository.ts
  - services/user-service/src/services/user.service.ts
  - services/user-service/src/services/bio-profile.service.ts
  - services/user-service/tests/unit/user.service.test.ts
  - services/user-service/tests/unit/bio-profile.service.test.ts
  - services/user-service/package.json
  - services/user-service/tsconfig.json
verified_by: claude-opus-4-6
---
### 완료: user-service route + repository + service 레이어
- repositories: findById/findByEmail/updateUser(동적 SET)/softDelete, upsert(ON CONFLICT DO UPDATE), updateCalculated
- services: getMe(soft-delete 체크), updateMe, deleteMe, getBioProfile, createOrUpdateBioProfile, recalculate(Mifflin-St Jeor + TDEE + macro + [1200,5000] clamp)
- routes: GET/PATCH/DELETE /users/me, POST/GET/PATCH /users/me/bio-profile, POST /ws/ticket (Redis TTL 30s, rate limit 10/min)
- PHI audit fail-closed (writePhiAuditLog on GET/PATCH bio-profile)
- 18 unit tests PASS, 94% line coverage, typecheck 0 errors, lint 0 errors
- ESM jest: jest.unstable_mockModule + top-level await
### 미완료: content-service (IMPL-003), meal-plan-engine (IMPL-004)
### 연관 파일: services/user-service/src/, services/user-service/tests/

---
date: 2026-04-10
agent: claude-sonnet-4-6
task_id: IMPL-001
commit_sha: 0dc3f97
files_changed:
  - packages/shared-types/src/entities.ts
  - packages/shared-types/src/index.ts
  - .claude/tasks.yaml
verified_by: human
---
### 완료: DB 기초 공사
- db/migrations/0001_initial-schema.sql 검증 완료 (spec §3.1과 일치, 13테이블 + materialized view)
- packages/shared-types/src/entities.ts 신규 — 13개 테이블 row TypeScript 타입 정의
  (User, BioProfile, Celebrity, BaseDiet, Recipe, Ingredient, RecipeIngredient,
   MealPlan, InstacartOrder, Subscription, DailyLog, DietViewEvent, PhiAccessLog)
- typecheck/lint 통과
### 미완료: 서비스별 route/repository/service 레이어 (IMPL-002 이후)
### 연관 파일: packages/shared-types/src/, db/migrations/

---
date: 2026-04-08
agent: claude-opus-4-6
task_id: BOOT-003
commit_sha: 5ae440f
files_changed:
  - .claude/tasks.yaml
  - .claude/tasks.schema.json
  - scripts/check_task_transitions.py
verified_by: claude-opus-4-6
---
### 완료: tasks.yaml 스키마 검증 + 전이 규칙 검증
- tasks.schema.json 검증 통과 (jsonschema validate)
- check_task_transitions.py 역전 탐지 통과
- done 전환 시 IMPL LOG verified_by 크로스체크 로직 확인
### 미완료: 없음
### 연관 파일: .claude/tasks.yaml, .claude/tasks.schema.json, scripts/check_task_transitions.py

---
date: 2026-04-08
agent: claude-opus-4-6
task_id: BOOT-004
commit_sha: 5ae440f
files_changed:
  - .github/workflows/ci.yml
  - scripts/validate_impl_log.py
  - tests/contract/test_spec_contracts.py
verified_by: claude-opus-4-6
---
### 완료: CI 10 Job 파이프라인 + 검증 스크립트 + Contract Tests
- ci.yml 10 Job 확인 (validate-docs/schemas/compliance, lint-typecheck, test, contract-tests, security-scan, require-log-entry, generate-progress, notify-on-failure)
- validate_impl_log.py 통과 (빈 로그 → pass)
- test_spec_contracts.py 4/4 통과 (UUID v7, 에러 포맷 requestId, CASCADE 금지)
### 미완료: 없음
### 연관 파일: .github/workflows/ci.yml, scripts/validate_impl_log.py, tests/contract/test_spec_contracts.py

---
date: 2026-04-08
agent: claude-opus-4-6
task_id: BOOT-005
commit_sha: 5ae440f
files_changed:
  - .claude/rules/security.md
  - .claude/rules/evaluator-runtime.md
  - spec.md
verified_by: claude-opus-4-6
---
### 완료: 시크릿 스캔 패턴 보강 + evaluator MCP + spec changelog
- security.md: Stripe (sk_live_, sk_test_) + Slack (xoxb-, xoxp-) 패턴 확인
- evaluator-runtime.md: EVALUATOR_BROWSER_TOOL 환경변수 indirection 확인
- spec.md: v1.4.1 changelog 반영 확인
### 미완료: 없음
### 연관 파일: .claude/rules/security.md, .claude/rules/evaluator-runtime.md, spec.md

---
date: 2026-04-11
agent: claude-opus-4-6
task_id: IMPL-005
commit_sha: e7d7b8b
files_changed:
  - packages/service-core/src/middleware/jwt.ts
  - packages/service-core/src/middleware/jwt-stub.ts (deleted)
  - packages/service-core/src/app.ts
  - packages/service-core/src/index.ts
  - packages/service-core/package.json
  - packages/service-core/tests/unit/jwt.test.ts
verified_by: claude-opus-4-6
---
### 완료: JWT 실제 구현 (Cognito JWKS 검증) — IMPL-005
- jwt-stub.ts 삭제, jwt.ts 신규 생성 (jose 라이브러리 기반 JWKS 검증)
- createRemoteJWKSet + jwtVerify로 Cognito JWT signature/expiry/issuer/audience 검증
- stub mode: dev/test에서 JWKS_URI 미설정 시 userId='dev-user-stub' fallback
- production에서 JWKS_URI 미설정 시 process.exit(1) (fail-closed)
- PUBLIC_PATHS: /health, /docs, /docs/json은 JWT 검증 스킵
- request.userId에 JWT sub claim 값 세팅
- 8개 unit test 통과 (stub 3 + JWKS 5), 80.64% line coverage
- user-service 18개 기존 테스트 전체 통과 확인
### 미완료: 없음
### 연관 파일: packages/service-core/src/middleware/jwt.ts, packages/service-core/tests/unit/jwt.test.ts

---
date: 2026-04-11
agent: claude-opus-4-6
task_id: IMPL-006
commit_sha: 8816050
files_changed:
  - packages/service-core/src/crypto/phi-codec.ts
  - packages/service-core/src/crypto/index.ts
  - packages/service-core/src/index.ts
  - packages/service-core/tests/unit/phi-codec.test.ts
  - db/migrations/0002_phi-encryption-columns.sql
  - services/user-service/src/repositories/bio-profile.repository.ts
  - services/user-service/src/services/bio-profile.service.ts
  - services/user-service/src/routes/bio-profile.routes.ts
  - services/user-service/src/index.ts
  - services/user-service/tests/unit/bio-profile.service.test.ts
verified_by: claude-opus-4-6
---
### 완료: PHI AES-256-GCM 암호화 코덱 + bio-profile 적용 — IMPL-006
- phi-codec.ts: AES-256-GCM 암호화/복호화 (node:crypto, 외부 의존성 없음)
- PhiKeyProvider 인터페이스 + EnvPhiKeyProvider (HKDF per-user DEK 파생)
- envelope 형식: [version(1)][iv(12)][authTag(16)][ciphertext(N)] → base64
- bio-profile repository: biomarkers, medical_conditions, medications 암호화 저장/복호화 조회
- DB migration: 3개 PHI 칼럼 TEXT[] / JSONB → TEXT (encrypted base64)
- service/routes에 PhiKeyProvider 전달 (fail-closed: 암호화 실패 시 요청 차단)
- 18개 코덱 unit test (roundtrip, 변조 탐지, userId 격리, version check 등) 97.29% coverage
- user-service 18개 기존 테스트 전체 통과 확인
### 미완료: AWS KMS KmsPhiKeyProvider, users.email 암호화, 키 로테이션 (별도 작업)
### 연관 파일: packages/service-core/src/crypto/phi-codec.ts, db/migrations/0002_phi-encryption-columns.sql, services/user-service/src/repositories/bio-profile.repository.ts

---
date: 2026-04-13
agent: claude-opus-4-6
task_id: IMPL-007
commit_sha: 679c455
files_changed:
  - services/user-service/src/routes/daily-log.routes.ts
  - services/user-service/src/services/daily-log.service.ts
  - services/user-service/src/repositories/daily-log.repository.ts
  - services/user-service/src/index.ts
verified_by: claude-opus-4-6
---
### 완료: daily tracking API (POST/GET/summary) — IMPL-007
- POST /users/me/daily-logs, GET /users/me/daily-logs (cursor pagination), GET /users/me/daily-logs/summary
- daily-log repository: create, findByUserIdAndDate, listByUserId, summary (7/30일 집계)
- parameterized queries, Zod validation, ISO 8601 dates
### 미완료: 없음
### 연관 파일: services/user-service/src/routes/daily-log.routes.ts, services/user-service/src/repositories/daily-log.repository.ts

---
date: 2026-04-13
agent: claude-opus-4-6
task_id: IMPL-008
commit_sha: d0cc06b
files_changed:
  - services/user-service/src/routes/auth.routes.ts
  - services/user-service/src/services/auth.service.ts
  - services/user-service/src/index.ts
verified_by: claude-opus-4-6
---
### 완료: auth service (signup/login/refresh) with dev stub — IMPL-008
- POST /auth/signup, POST /auth/login, POST /auth/refresh
- dev stub mode: JWT 생성 (HS256), 실 Cognito 연동은 추후
- Zod input validation, error envelope
### 미완료: 실 Cognito 연동 (production)
### 연관 파일: services/user-service/src/routes/auth.routes.ts, services/user-service/src/services/auth.service.ts

---
date: 2026-04-13
agent: claude-opus-4-6
task_id: IMPL-009
commit_sha: bd3bb86
files_changed:
  - db/seeds/types.ts
  - db/seeds/loaders/ingredientLoader.ts
  - db/seeds/loaders/celebrityLoader.ts
  - db/seeds/run.ts
  - db/seeds/data/_ingredients.json
  - db/seeds/data/ariana-grande.json
  - db/seeds/data/beyonce.json
  - db/seeds/data/gwyneth-paltrow.json
  - db/seeds/data/cristiano-ronaldo.json
  - db/seeds/data/lebron-james.json
  - db/seeds/data/dwayne-johnson.json
  - db/seeds/data/natalie-portman.json
  - db/seeds/data/joaquin-phoenix.json
  - db/seeds/data/jennifer-aniston.json
  - db/seeds/data/tom-brady.json
  - db/package.json
  - package.json
verified_by: claude-opus-4-6
---
### 완료: seed data loader + 10 celebrity datasets — IMPL-009
- TypeScript seed loader (tsx): 단일 트랜잭션, ON CONFLICT 멱등성
- 10 celebrities × 18 recipes = 180 recipes, 237 ingredients, 1,038 recipe_ingredients
- DB 실행 검증: 카운트 정확, 2차 실행 중복 없음 (멱등성 통과)
- meal type 분포 균일: breakfast:4, lunch:4, dinner:4, snack:4, smoothie:2
### 미완료: 없음
### 연관 파일: db/seeds/, db/package.json

---
date: 2026-04-14
agent: claude-opus-4-6
task_id: IMPL-010
commit_sha: f8bdb7b
files_changed:
  - services/meal-plan-engine/requirements.txt
  - services/meal-plan-engine/src/config.py
  - services/meal-plan-engine/main.py
  - services/meal-plan-engine/src/routes/meal_plans.py
  - services/meal-plan-engine/tests/unit/test_meal_plan_routes.py
  - services/user-service/src/services/auth.service.ts
  - services/user-service/src/index.ts
  - services/user-service/tests/unit/auth.service.test.ts
  - services/user-service/package.json
  - services/user-service/tsconfig.build.json
  - services/content-service/package.json
  - services/content-service/tsconfig.build.json
verified_by: claude-opus-4-6 + codex (2-round review)
---
### 완료: Critical/High 보안 패치 — IMPL-010
- **C1**: meal-plan-engine JWT 서명 검증 (base64 → PyJWT HS256 + token_use=access 체크)
- **C2**: DevAuthProvider production 가드 (JWT_SECRET 기본값 → process.exit, Cognito 미설정 → 경고)
- **C3**: requirements.txt 수정 (redis, boto3 추가, httpx 중복 제거, python-jose → PyJWT[crypto] CVE 해소)
- **H1**: DEV_SECRET 하드코딩 → loadDevSecret() + env JWT_SECRET
- **H2**: config.py @model_validator — production에서 기본 JWT_SECRET 차단
- **H3**: CORSMiddleware 추가 (allow_origins from env, wildcard 금지)
- **H4**: 글로벌 에러 핸들러 (spec §4.1 에러 봉투 + requestId)
- **H5**: GET /health 엔드포인트
- **H6**: tsconfig.build.json + node dist/index.js 프로덕션 빌드 (user-service, content-service)
- refreshTokens() 서명 검증 추가 (decodeJwt → jwtVerify + token_use=refresh)
- 네거티브 테스트 5개: 잘못된 서명, 만료, refresh→API, token_use 누락, 헬스체크
- Codex 2라운드 리뷰: 시크릿 계약 통일(JWT_SECRET), 실행 순서 교정(010-c→010-b), PyJWT CVE 교체
### 미완료: CognitoAuthProvider (Phase B), staging 시크릿 가드, JWT 키 로테이션, iss/aud claim 검증
### 연관 파일: services/meal-plan-engine/, services/user-service/, services/content-service/

---
date: 2026-04-14
agent: claude-opus-4-6 + codex (2-round review)
task_id: IMPL-011
commit_sha: a7a3c5f
files_changed:
  - services/user-service/src/repositories/user.repository.ts
  - services/user-service/src/services/auth.service.ts
  - services/user-service/tests/unit/auth.service.test.ts
  - services/meal-plan-engine/src/config.py
  - services/meal-plan-engine/src/consumers/sqs_consumer.py
  - services/meal-plan-engine/src/api/websocket.py
  - services/meal-plan-engine/main.py
  - services/meal-plan-engine/requirements.txt
  - services/meal-plan-engine/src/logging_config.py
verified_by: claude-opus-4-6 + codex-review
---
### 완료: MEDIUM 보안 이슈 수정 — IMPL-011 (M1~M5)
- **M1 (signup TOCTOU race)**: INSERT 시 PG 23505 unique_violation catch → null 반환, auth.service.ts에서 ValidationError throw. cognito_sub UNIQUE도 커버 (Codex 2차 리뷰 반영). 기존 findByEmail 사전체크는 fast-path로 유지.
- **M5 (updateUser SQL column allowlist)**: ALLOWED_USER_COLUMNS ReadonlySet 추가, Object.keys(data) 필터 후 불일치 시 throw. 런타임 가드로 SQL injection 방어 (기존 Zod .strict()은 API 경계만 보호).
- **M4 (Pydantic Settings 미등록)**: config.py에 REDIS_URL, SQS_QUEUE_URL, AWS_REGION 필드 추가. websocket.py의 getattr, sqs_consumer.py의 hasattr 제거 → settings 직접 접근.
- **M2 (SQS consumer crash → plan stuck)**: 6가지 수정 — (1) per-message retry dict (MessageId 키), (2) pre-extract plan_id/user_id, (3) startup stuck-plan recovery (generating > 5min → failed), (4) asyncio.to_thread()로 sync boto3 래핑 (event loop 블로킹 방지), (5) 지수 백오프 (최대 5분), (6) CancelledError 처리. main.py lifespan에서 consumer task 시작/셧다운 관리.
- **M3 (Python structured logging)**: python-json-logger==2.0.7 도입, logging_config.py 신규 생성, main.py 최상단에서 configure_logging() 호출. 기존 logging.getLogger() call site 변경 불필요 (root handler 전파).
- **M6**: IMPL-010에서 이미 해결 (python-jose → PyJWT[crypto])
- Codex 2라운드 리뷰: 1차(BLOCKER 4 + WARNING 4), 2차(BLOCKER 1 + WARNING 2). ON CONFLICT → PG 23505 catch로 전환, asyncio.to_thread, lifespan task 관리, 지수 백오프 등 반영.
### 미완료: UpdateableUserFields 타입 중복 정리, aiobotocore 전환, 멀티인스턴스 stuck-plan lease/heartbeat, SQS consumer 단위 테스트 추가
### 연관 파일: services/user-service/src/repositories/user.repository.ts, services/user-service/src/services/auth.service.ts, services/user-service/tests/unit/auth.service.test.ts, services/meal-plan-engine/src/config.py, services/meal-plan-engine/src/consumers/sqs_consumer.py, services/meal-plan-engine/src/api/websocket.py, services/meal-plan-engine/main.py, services/meal-plan-engine/requirements.txt, services/meal-plan-engine/src/logging_config.py

---
date: 2026-04-14
agent: claude-opus-4-6 + codex (2-round review)
task_id: IMPL-012
commit_sha: 59ff9ef
files_changed:
  - services/user-service/src/repositories/subscription.repository.ts
  - services/user-service/src/services/subscription.service.ts
  - services/user-service/src/routes/subscription.routes.ts
  - services/user-service/tests/unit/subscription.service.test.ts
  - packages/service-core/src/errors.ts
  - packages/service-core/src/index.ts
  - packages/service-core/src/middleware/jwt.ts
  - services/user-service/src/index.ts
  - services/user-service/src/repositories/user.repository.ts
  - db/migrations/0005_subscription-stripe-index.sql
  - .env.example
verified_by: claude-opus-4-6 + codex-review
---
### 완료: Stripe 구독 + Webhook (Phase B) — IMPL-012
- **4개 API 엔드포인트**: POST /subscriptions (Checkout Session), GET /subscriptions/me, POST /subscriptions/me/cancel, POST /webhooks/stripe
- **subscription.repository.ts**: findByUserId, findByStripeSubscriptionId, updateByStripeId, syncTierTransaction (3-step 트랜잭션: expire → upsert → sync users.subscription_tier)
- **subscription.service.ts**: Stripe Checkout Session 생성, webhook 이벤트 핸들링 (checkout.session.completed, customer.subscription.updated/deleted, invoice.payment_failed), 경량 circuit breaker (5회/60초), Stripe status → 내부 status 매핑, users.subscription_tier 동기화
- **subscription.routes.ts**: Fastify scoped content-type parser로 webhook raw body 보존 (Stripe signature 검증), Zod input validation
- **SubscriptionRequiredError**: service-core에 403 에러 클래스 추가
- **user.repository.ts**: updateSubscriptionTier() 추가 (Pool|PoolClient 지원, ALLOWED_USER_COLUMNS와 분리)
- **jwt.ts**: /webhooks/stripe를 PUBLIC_PATHS에 추가
- **0005 migration**: stripe_subscription_id UNIQUE index, user_id index, active 구독 방지 partial unique index
- **index.ts**: EnvSchema에 STRIPE_* 6개 필드 추가, Stripe 인스턴스 생성, subscriptionRoutes 등록
- **16개 단위 테스트**: createCheckoutSession (4), getMySubscription (2), cancelSubscription (3), handleWebhookEvent (7)
- Codex 2라운드 리뷰: 1차(B1 ON CONFLICT index, B2 다중 active 방지, W1 멱등키, W2 webhook-first, W3 URL allowlist), 2차(B3 CONCURRENTLY 제거, W4 path prefix, W5 webhook retrieve 금지, W6 API version pin)
### 미완료: 구독 quota enforcement (IMPL-013), 계정 삭제 시 Stripe 해지, Stripe Customer Portal, Redis circuit breaker
### 연관 파일: services/user-service/src/repositories/subscription.repository.ts, services/user-service/src/services/subscription.service.ts, services/user-service/src/routes/subscription.routes.ts, services/user-service/tests/unit/subscription.service.test.ts, packages/service-core/src/errors.ts, packages/service-core/src/index.ts, packages/service-core/src/middleware/jwt.ts, services/user-service/src/index.ts, services/user-service/src/repositories/user.repository.ts, db/migrations/0005_subscription-stripe-index.sql, .env.example

---
date: 2026-04-14
agent: claude-opus-4-6 + codex (adversarial review ×2)
task_id: IMPL-013
commit_sha: e887448
files_changed:
  - services/meal-plan-engine/src/services/quota_service.py
  - services/meal-plan-engine/src/clients/user_client.py
  - services/meal-plan-engine/src/repositories/meal_plan_repository.py
  - services/meal-plan-engine/src/routes/meal_plans.py
  - services/meal-plan-engine/tests/unit/test_quota_service.py
  - services/meal-plan-engine/tests/unit/test_meal_plan_routes.py
  - db/migrations/0006_quota-enforcement.sql
verified_by: claude-opus-4-6 + codex-review
---
### 완료: 구독 Quota Enforcement (Phase B) — IMPL-013
- **Tier 한도 강제**: POST /meal-plans/generate — Free=0 (403 SUBSCRIPTION_REQUIRED), Premium=4/month, Elite=unlimited
- **quota_service.py (신규, 177 LOC)**: Pydantic 티어 한도 모델, atomic COUNT+INSERT with `pg_advisory_xact_lock` (TOCTOU 방지), SHA-256 idempotency key, Retry-After(sec) 계산 (다음 달 1일 UTC까지)
- **user_client.get_subscription()**: user-service에서 tier 조회, 실패 시 503 (fail-closed — Free로 degrade하지 않음)
- **meal_plan_repository.py**: find_recent_duplicate() (idempotency_key lookup), count_plans_this_month() 추가
- **0006 migration**: meal_plans.idempotency_key (CHAR(64)) 컬럼 + 2개 partial index (월별 카운트용, 멱등성 lookup용)
- **46개 단위 테스트**: quota_service 23 + meal_plan 라우트 신규 8 + 기존 15 — 모두 PASS
- **Codex 2라운드 adversarial review 반영**:
  - null quota_override가 기본 티어 한도보다 낮게 떨어지는 downgrade 버그 수정
  - negative override 차단 (Pydantic `ge=0` 제약)
  - timezone cast 일관성 (모든 month boundary를 UTC로 강제)
  - COUNT 쿼리 empty row 가드
  - user-service 4xx 에러를 5xx로 오인하지 않도록 분기
### 미완료: 계정 삭제 시 Stripe 해지, Stripe Customer Portal, Redis 기반 circuit breaker (IMPL-012에서 이월), quota_override admin UI
### 연관 파일: services/meal-plan-engine/src/services/quota_service.py, services/meal-plan-engine/src/clients/user_client.py, services/meal-plan-engine/src/repositories/meal_plan_repository.py, services/meal-plan-engine/src/routes/meal_plans.py, services/meal-plan-engine/tests/unit/test_quota_service.py, services/meal-plan-engine/tests/unit/test_meal_plan_routes.py, db/migrations/0006_quota-enforcement.sql

---
date: 2026-04-16
agent: claude-opus-4-7 (v2 플랜 — codex-o3 adversarial review 반영)
task_id: IMPL-014-a
commit_sha: 0d67d8a
files_changed:
  - services/meal-plan-engine/src/services/sqs_publisher.py
  - services/meal-plan-engine/src/routes/meal_plans.py
  - services/meal-plan-engine/src/consumers/sqs_consumer.py
  - services/meal-plan-engine/tests/unit/test_meal_plan_routes.py
verified_by: claude-opus-4-7
---
### 완료: SQS Publisher + Consumer Wiring — IMPL-014-a
- **배경**: IMPL-013 이후 "백엔드 MVP 완성" 오판 → 사용자 재검토 요청 → 2개 Explore 감사 + Codex adversarial review로 E2E 5곳 단절 확인 (v2 플랜). 14-a는 첫 서브태스크 (SQS publish + consumer wiring).
- **sqs_publisher.py (신규, 58 LOC)**: `PlanGenerationMessage` Pydantic envelope (Codex #8) — 모든 필드 타입 엄격 + `duration_days: int(ge=1, le=30)`. `enqueue_plan_job()` boto3 `asyncio.to_thread` 래핑. import-time boot check로 `SQS_QUEUE_URL` 미설정 시 즉시 RuntimeError (Codex #1 — in-process fallback 차단). pytest/`NODE_ENV=test` 환경 exempt.
- **routes/meal_plans.py**: POST /generate 플랜 생성 직후 `enqueue_plan_job` 호출. 실패 시 `repo.update_meal_plan(..., {"status": "failed"})` + 503 SERVICE_UNAVAILABLE 반환 (silent drop 금지).
- **consumers/sqs_consumer.py**: `_process_message`가 `PlanGenerationMessage.model_validate`로 envelope 검증. `on_progress` no-op 제거 → `broadcast_progress(plan_id, payload)` 호출로 WebSocket 전파 경로 확보. `duration_days`는 local capture + TODO(IMPL-014-c) — pipeline.py 시그니처 확장 후 run_pipeline에 전달.
- **테스트 25/25 PASS** (tests/unit/test_meal_plan_routes.py):
  - 신규 4건: envelope 필수 필드/타입 검증, POST→SQS enqueue 성공, enqueue 실패 시 503+failed, consumer `on_progress`→`broadcast_progress` 전파.
  - 기존 4건(`test_generate_success`, `_premium_under_limit_201`, `_elite_201_no_count`, `_quota_override_null`)에 `@patch("...enqueue_plan_job")` 추가.
  - `_auth_header()` JWT `sub`을 `"u1"` → 유효 UUID로 교체 (PlanGenerationMessage.user_id가 UUID 검증).
- **수동 smoke 3건 PASS**: `SQS_QUEUE_URL=""` + `NODE_ENV=development` → RuntimeError, `NODE_ENV=test` → 통과 (hermetic), `SQS_QUEUE_URL=localstack` → 통과.
- **ruff clean** (변경 파일 4개 + 전체 59 unit tests 통과).
### 미완료: 14-b (main.py WS 라우터 등록 + Redis key prefix `ws_ticket:` → `ws:ticket:` 통일 + user-service STRIPE 게이트), 14-c (pipeline.py weekly_template 의존 제거 + duration_days run_pipeline에 전달 + LocalStack E2E 통합 테스트), 14.5 (validate_impl_log.py 미완료 항목 hard-check 강화), 15 (docker-compose.yml LocalStack + Dockerfiles).
### 연관 파일: services/meal-plan-engine/src/services/sqs_publisher.py, services/meal-plan-engine/src/routes/meal_plans.py, services/meal-plan-engine/src/consumers/sqs_consumer.py, services/meal-plan-engine/tests/unit/test_meal_plan_routes.py


---
date: 2026-04-16
agent: claude-opus-4-7
task_id: IMPL-014-b
commit_sha: 78bf1d4
files_changed:
  - services/meal-plan-engine/main.py
  - services/meal-plan-engine/src/api/websocket.py
  - services/user-service/src/env.ts
  - services/user-service/src/index.ts
  - services/user-service/tests/unit/env-gate.test.ts
  - .env.example
verified_by: claude-opus-4-7
---
### 완료: WebSocket 라우터 mount + Redis 티켓 prefix 통일 + Stripe feature gate (IMPL-014-b)
- main.py: `app.include_router(ws_router)` 추가 — OpenAPI에 `/ws/meal-plans/{plan_id}/status` 등록 확인 (smoke #3 PASS).
- websocket.py: Redis 티켓 키를 `ws_ticket:` → `ws:ticket:`으로 수정 — spec §4.2 + user-service `ws-ticket.routes.ts`와 정본 일치 (smoke #4 grep 확인).
- env.ts 신규: EnvSchema를 index.ts에서 분리 — import-only 재사용 경로 확보 + 테스트 커버리지 회귀 회피.
- index.ts: STRIPE_ENABLED=true 분기에서만 Stripe 인스턴스화 + subscriptionRoutes 등록. false이면 경고 로그 후 스킵 (meal-plan-engine `user_client.get_subscription`이 404 → `{tier:"free"}` fallback으로 안전).
- Stripe env 누락 시 `process.exit(1)` 타입 narrowing으로 `!` non-null assertion 0건 — strict-type-checked 통과.
- env-gate.test.ts 신규: 4개 케이스 PASS (기본/플래그 true 변수없음 통과/플래그 true 변수전부 있음/PHI 길이 검증).
- .env.example: `STRIPE_ENABLED=false`, `PHI_ENCRYPTION_KEY`(64-hex), `SQS_QUEUE_URL` 3개 누락 변수 추가.
- 테스트: user-service 60/60 PASS (신규 4건 포함, coverage 84.95%), meal-plan-engine 59/59 PASS (회귀 없음).
- lint/typecheck: 신규 오류 0건. 기존 14건(subscription.service.ts, auth.service.ts)은 IMPL-012 이전부터 존재.
### 미완료: pipeline.py `weekly_template` 제거 + `duration_days` 수신 (IMPL-014-c), LocalStack 기반 E2E 통합 테스트 T1/T2/T3 (IMPL-014-c), multi-worker WS Redis pub/sub (out-of-scope), WS 라우터 auth scope 조정 (out-of-scope).
### 연관 파일: services/meal-plan-engine/main.py, services/meal-plan-engine/src/api/websocket.py, services/user-service/src/env.ts, services/user-service/src/index.ts, services/user-service/tests/unit/env-gate.test.ts, .env.example


---
date: 2026-04-16
agent: claude-opus-4-7
task_id: IMPL-014-c
commit_sha: f5c22fb
files_changed:
  - services/meal-plan-engine/src/engine/pipeline.py
  - services/meal-plan-engine/src/consumers/sqs_consumer.py
  - services/meal-plan-engine/tests/unit/test_engine.py
verified_by: claude-opus-4-7
---
### 완료: pipeline duration_days plumbing + weekly_template 제거 (IMPL-014-c)
- pipeline.py: `run_pipeline` 시그니처에 `duration_days: int` **필수** 파라미터 추가 (기본값 없음 — caller 누락 시 fail-fast).
- pipeline.py: `_build_weekly_plan(safe_recipes, duration_days)` 헬퍼 신설 — `meal_type`별로 그룹핑 후 결정론적 round-robin 배치. `base_diet["weekly_template"]` 의존 (항상 빈 리스트 반환하던 dead code) 제거.
- pipeline.py: variety_optimizer 호출은 기존 `optimize_variety(weekly_plan, candidate_pool)` 계약 유지 — 불변식 유지(`MAX_RECIPE_REPEATS=2`).
- sqs_consumer.py: `_duration_days = msg.duration_days  # noqa: F841` TODO 제거, `run_pipeline(..., duration_days=duration_days, ...)`로 정상 전달.
- test_engine.py: 5건 추가 — `_build_weekly_plan` 단위 3건 (round-robin 순서 + mixed meal_type + empty pool) + `run_pipeline` async 2건 (duration=7 progress 이벤트 순서 확인, duration=3 길이 확인). 기존 `_mk_slot` 헬퍼 재사용.
- 수동 smoke 3건 PASS: (1) `inspect.signature`로 `duration_days` required 확인, (2) consumer grep 결과 `duration_days = msg.duration_days` + `duration_days=duration_days` 2개 매치만, (3) `weekly_template` src/ 전역 0 매치.
- 테스트: meal-plan-engine 64/64 PASS (기존 59 + 신규 5, 0.09s). ruff clean (E402 mid-file import 1회 지적 → top-level로 이동 후 재검증 통과).
### 미완료: LocalStack 기반 E2E 통합 테스트 T1/T2/T3 (→ IMPL-014-d, IMPL-015의 docker-compose + Dockerfile 편성 이후 실행), `requirements.txt` moto 추가 (→ 14-d 내 in-process 대안 결정), variety_optimizer swap 전략 개선 (out-of-scope), recipe.nutrition 부재 시 fallback 강화 (out-of-scope), `validate_impl_log.py` 이전 엔트리 미완료 hard-check 강화 (→ 14.5).
### 연관 파일: services/meal-plan-engine/src/engine/pipeline.py, services/meal-plan-engine/src/consumers/sqs_consumer.py, services/meal-plan-engine/tests/unit/test_engine.py


---
date: 2026-04-16
agent: claude-opus-4-7 + codex (adversarial review)
task_id: IMPL-015
commit_sha: d1a9913
files_changed:
  - docker-compose.yml
  - docker/localstack/init/01-create-sqs-queue.sh
  - services/user-service/Dockerfile
  - services/content-service/Dockerfile
  - services/meal-plan-engine/Dockerfile
  - .dockerignore
  - .npmrc
  - services/meal-plan-engine/src/config.py
  - services/meal-plan-engine/src/consumers/sqs_consumer.py
  - services/meal-plan-engine/src/services/sqs_publisher.py
  - packages/service-core/src/app.ts
verified_by: claude-opus-4-7
---
### 완료: docker-compose LocalStack + 서비스 Dockerfile 3종 (IMPL-015)
- docker-compose.yml: LocalStack(SQS only, `localstack/localstack:3`) + user-service/content-service/meal-plan-engine 3개 서비스 추가. `depends_on.condition: service_healthy` 체인으로 부팅 순서 강제. 각 서비스 `wget`/`python urllib` healthcheck.
- docker/localstack/init/01-create-sqs-queue.sh: LocalStack ready-hook. `awslocal sqs create-queue`로 `meal-plan-generation` 큐 자동 생성 (VisibilityTimeout=120, MessageRetentionPeriod=14d).
- services/{user,content}-service/Dockerfile: node:22-alpine multi-stage (builder/runtime). `corepack prepare pnpm@9.12.3` + `pnpm fetch` + `pnpm install --offline --filter ...` + `pnpm deploy --prod /deploy`. non-root `app` user.
- services/meal-plan-engine/Dockerfile: python:3.12-slim multi-stage. builder에서 `pip install --prefix=/install`, runtime은 `/install`→`/usr/local` 복사만. non-root `app` user, `PYTHONUNBUFFERED=1`.
- .dockerignore: node_modules/dist/.venv/.env*/.worktrees/pipeline/runs/ 제외로 빌드 컨텍스트 최소화.
- **Codex adversarial review 반영 (2 HIGH fix)**:
  - HIGH #1 — boto3 `endpoint_url` 누락: `config.py`에 `AWS_ENDPOINT_URL: str | None = None` 추가, `sqs_consumer.py:150` + `sqs_publisher.py:53`에 `endpoint_url=settings.AWS_ENDPOINT_URL` 전달. prod에서 None → 실제 AWS, dev compose에서 LocalStack으로 라우팅.
  - HIGH #2 — pnpm workspace 평탄화: 루트 `.npmrc`에 `inject-workspace-packages=true` 추가. `pnpm deploy --prod`가 workspace:* 의존을 실제 파일로 복사하여 stand-alone bundle 생성.
- **smoke 검증 중 발견한 Fastify 5 호환성 fix**: `packages/service-core/src/app.ts`의 `Fastify({ logger: pinoInstance })` → `Fastify({ loggerInstance: ... })`. Fastify 5는 `logger` 옵션에 config object만 허용, pre-instantiated logger는 `loggerInstance`로 전달. 로컬 테스트는 createApp을 부팅하지 않아 탐지되지 않았던 잠복 버그.
- **LocalStack 태그 조정**: 계획된 `stable`은 2026.x (pro 에디션, AUTH_TOKEN 필요)로 전환되어 exit 55로 기동 실패. 커뮤니티 `localstack/localstack:3`으로 변경 → 무인증 정상 기동.
- **healthcheck IPv4 강제**: `http://localhost` → `http://127.0.0.1`. alpine busybox wget이 `localhost`를 IPv6 `::1`로 우선 해석하는데 Fastify는 IPv4 0.0.0.0에만 바인드 → Connection refused. IPv4 리터럴로 해결.
- **수동 smoke 7/7 PASS**: (1) `.dockerignore` 효과 확인, (2) `docker compose build` 3개 이미지 빌드 성공, (3) `docker compose up -d` 6개 컨테이너 기동, (4) `docker compose ps` 전부 healthy, (5) `awslocal sqs list-queues`에 `meal-plan-generation` 표시, (6) `curl /health` 3개 전부 200, (7) meal-plan-engine 로그 "SQS consumer started, polling http://localstack:4566/...".
- **회귀 0**: pnpm -r test 60/60 PASS, meal-plan-engine pytest 64/64 PASS.
### 미완료: LocalStack 기반 E2E 통합 테스트 T1/T2/T3 (→ IMPL-014-d), DB migration runner 원샷 서비스 (→ 14-d 전 별도 태스크), TS `/health` 응답에 version 필드 추가 (→ 별도 DoD 패치), compose 기반 CI 통합 (→ IMPL-016), 이미지 레지스트리 푸시 + 버전 태깅 (→ IMPL-017), hot-reload 개발 모드 (→ 별도 `docker-compose.dev.yml` override 태스크).
### 연관 파일: docker-compose.yml, docker/localstack/init/01-create-sqs-queue.sh, services/user-service/Dockerfile, services/content-service/Dockerfile, services/meal-plan-engine/Dockerfile, .dockerignore, .npmrc, services/meal-plan-engine/src/config.py, services/meal-plan-engine/src/consumers/sqs_consumer.py, services/meal-plan-engine/src/services/sqs_publisher.py, packages/service-core/src/app.ts

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-014-d1
commit_sha: e9591ea
files_changed:
  - docker-compose.yml
  - services/meal-plan-engine/requirements.txt
  - services/meal-plan-engine/pytest.ini
  - services/meal-plan-engine/tests/integration/conftest.py
  - services/meal-plan-engine/tests/integration/test_e2e_happy_path.py
  - services/meal-plan-engine/src/database.py
  - services/meal-plan-engine/src/clients/user_client.py
verified_by: claude-opus-4-7 + codex (adversarial review ×1)
---
### 완료: compose db-migrate + T1 happy-path E2E — IMPL-014-d1
- **db-migrate one-shot 서비스**: `postgres:16-alpine` + psql 루프 + `pgmigrations` 추적 테이블로 idempotent 멀티 마이그레이션 적용. `service_completed_successfully`로 3개 서비스(user/content/meal-plan-engine) depends_on 체인. postgres `pg_uuidv7`은 `docker/postgres/init/` 에서 미리 생성.
- **node-pg-migrate 포기 이유**: 초기 계획(node-pg-migrate@7 + `--no-transaction`)은 `CREATE INDEX CONCURRENTLY` 가 여전히 transaction block 에서 실행되어 25001 오류 발생. psql 루프는 각 `.sql` 파일을 개별 statement 로 순차 실행하여 문제 해결. 부수 이익: npx cold-download(~15s) 제거, `npm-cache` named volume 불필요.
- **user-service `/subscriptions/me` 404 (STRIPE_ENABLED=false)**: compose 기본값 `STRIPE_ENABLED: "false"` 로 `subscriptionRoutes` 미등록 → user_client `{tier:"free"}` fallback → 403 SUBSCRIPTION_REQUIRED. 수정: dev compose 에서 `STRIPE_ENABLED: "true"` + dummy Stripe env vars 주입. `getMySubscription` 은 DB-only 라 Stripe API 미호출.
- **asyncpg JSONB 역직렬화 버그**: JSONB 컬럼이 기본값으로 `str` 로 디코딩되어 `preferences.get(...)` `AttributeError` 발생. `database.py` 에 `init=_register_jsonb_codec` 추가(json/jsonb 양쪽 모두 커버). encoder 는 `str` 은 그대로, dict/list 는 `json.dumps` 하여 기존 `json.dumps(x)` 호출도 안전.
- **bio-profile 숫자 필드 타입 버그**: pg NUMERIC 은 node-postgres 기본 driver 가 `str` 반환 → `height_cm/weight_kg` 이 `"70.0"` 문자열로 도달 → `macro_rebalancer.rebalance_macros` 에서 `TypeError: '<=' not supported between str and int`. `user_client.get_bio_profile` 에 float 강제 coercion 추가.
- **T1 테스트 설계(Codex HIGH #2/#3 반영)**: primary 완료 신호 = REST GET polling(DB `status='completed'`, 60s timeout, 1s interval). WS 는 secondary — 핸드셰이크 성공만 확인. 이유: `src/api/websocket.py` 의 `_connections` dict 는 in-memory + no replay → 구독 타이밍 race 로 event 손실. consumer 의 최종 `repo.update_meal_plan({status:"completed"})` write 는 원자적.
- **T1 fixtures (Codex HIGH #4/#5)**: `seed_base_diet` 는 meal_type 별 recipe 4개(breakfast/lunch/dinner/snack) 삽입 — 빈 candidate_pool 에서 `weekly_plan=[]` 반환 방지. `seed_user` 는 `subscriptions` row(`tier='premium'`, `status='active'`) 삽입 — user-service `getMySubscription` 의 free tier fallback 방지.
- **스코프 확장 근거**: 계획상 5-file cap 이었으나 실제 E2E 실행 중 발견된 3건의 잠복 버그(JSONB codec, NUMERIC coercion, STRIPE gating)를 수정하지 않으면 T1 통과 불가. 이는 "첫 real E2E 가 드러낸 production-path 버그" 로 해당 세션에서 fix-forward.
- **결과**: T1 happy path PASS(`status=='completed'`, `len(daily_plans)==7`, WS handshake OK). 유닛 회귀 64/64 PASS. 15 tables + pgmigrations 추적 테이블 확인.
### 미완료: T2 DLQ retry E2E (→ IMPL-014-d2), T3 WS ticket single-use reuse block (→ IMPL-014-d2), compose 기반 CI 통합 (→ IMPL-016), prod migration runner(dev-only psql 루프와 분리) (→ IMPL-017+).
### 연관 파일: docker-compose.yml, services/meal-plan-engine/requirements.txt, services/meal-plan-engine/pytest.ini, services/meal-plan-engine/tests/integration/conftest.py, services/meal-plan-engine/tests/integration/test_e2e_happy_path.py, services/meal-plan-engine/src/database.py, services/meal-plan-engine/src/clients/user_client.py

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-UI-001
commit_sha: 917cba9
files_changed:
  - packages/design-tokens/package.json
  - packages/design-tokens/tokens.css
  - packages/design-tokens/scripts/build.ts
  - packages/design-tokens/src/index.ts
  - packages/design-tokens/tsconfig.json
  - pnpm-workspace.yaml
  - pnpm-lock.yaml
  - .gitignore
  - turbo.json
verified_by: claude-opus-4-7
---
### 완료: design-tokens 패키지 + build 파이프라인 — IMPL-UI-001
- `@celebbase/design-tokens` workspace 패키지 신설: 원천 `tokens.css` + `scripts/build.ts` 파서 + 타입 생성된 `src/tokens.native.ts` (gitignore 대상, build 산출).
- `tokens.css`: light + `[data-theme='dark']` 블록으로 63개 `--cb-*` 커스텀 프로퍼티 — brand 50/100/500/600/700, neutral 0-900, semantic(success/warning/danger/info), color 별칭(bg/surface/text/border), typography(display/body/mono 패밀리 + xs-3xl sizes + line-heights/weights), shadow(ring/sm/md/lg), radius(sm/md/lg/pill), space 1-16.
- `scripts/build.ts`: `:root` + `[data-theme='dark']` 블록을 파싱해 `tokens.native.ts` 로 직접 타입된 light/dark 맵 emit. tsc emit 후 `dist/` 로 `.d.ts` 까지 번들.
- `pnpm-workspace.yaml`: `apps/*` glob 추가 — 후속 `apps/web` 을 수용할 자리.
- `turbo.json`: `storybook` (cache:false, persistent:true) + `build-storybook` (outputs:storybook-static/**) 태스크 등록.
- `.gitignore`: `packages/design-tokens/src/tokens.native.ts` (generated) + `packages/ui-kit/storybook-static/` 제외.
- 이전 세션 결과 (2026-04-16) 일괄 커밋으로 trackable 화. 직접 검증은 해당 세션에서 수행 완료 — 이번 엔트리는 history 정리.
### 미완료: CSS Modules 인프라 (→ IMPL-UI-002-P4), primitives 토큰 갭 보강 (→ IMPL-UI-002-P2).
### 연관 파일: packages/design-tokens/, pnpm-workspace.yaml, turbo.json, .gitignore

---
date: 2026-04-17
agent: claude-opus-4-7 + codex (plan review ×1)
task_id: IMPL-UI-SETUP
commit_sha: 81f8e06
files_changed:
  - packages/ui-kit/package.json
  - packages/ui-kit/tsconfig.json
  - packages/ui-kit/src/index.ts
  - packages/ui-kit/src/theme/ThemeProvider.tsx
  - packages/ui-kit/src/theme/ThemePrePaintScript.tsx
  - packages/ui-kit/.storybook/main.ts
  - packages/ui-kit/.storybook/preview.tsx
  - packages/ui-kit/stories/Tokens.stories.tsx
  - apps/web/package.json
  - apps/web/next.config.ts
  - apps/web/tsconfig.json
  - apps/web/next-env.d.ts
  - apps/web/src/app/layout.tsx
  - apps/web/src/app/page.tsx
  - apps/web/src/app/slice/layout.tsx
  - apps/web/src/app/slice/page.tsx
  - apps/web/src/app/slice/tokens/page.tsx
  - apps/web/src/styles/globals.css
  - apps/web/src/lib/axe-dev.ts
  - apps/web/public/fonts/Fraunces-Variable.woff2
  - apps/web/public/fonts/PlusJakartaSans-Variable.woff2
  - apps/web/public/fonts/JetBrainsMono-Variable.woff2
  - scripts/gate-check.sh
  - .claude/rules/pipeline.md
  - .claude/hooks/notify-done.sh
  - .claude/hooks/post-edit-lint.sh
  - .claude/hooks/pre-tool-safety.sh
  - pipeline/templates/FE-CODEX-HANDOFF.template.md
  - DESIGN.md
  - DESIGN-claude.md
  - DESIGN-codex.md
  - .gitignore
verified_by: claude-opus-4-7
---
### 완료: theme provider + Storybook + apps/web scaffold + FE 파이프라인 규칙 — IMPL-UI-SETUP
- `@celebbase/ui-kit` 패키지: `ThemeProvider` (Context + `useTheme()` 훅, `{mode, resolvedTheme, setMode}`, matchMedia 구독, localStorage persist, `document.documentElement.dataset.theme` 세팅) + `ThemePrePaintScript` (RSC-safe, 하드코딩 IIFE `<script>` 로 FOUC 방지) + `THEME_STORAGE_KEY` export.
- `packages/ui-kit/.storybook/{main,preview}.ts[x]`: Storybook 9 + `@storybook/react-vite`, `staticDirs` 로 `apps/web/public/fonts` → `/fonts`, `@font-face` 3종 (Plus Jakarta/JetBrains/Fraunces), `withThemeByDataAttribute` decorator + `addon-a11y` (WCAG2A/2AA) + viewport presets mobile(375)/tablet(768)/desktop(1440). `addon-essentials` **사용 금지** — Storybook 9 에서 해체됨.
- `packages/ui-kit/stories/Tokens.stories.tsx`: 토큰 쇼케이스 5 named exports (Colors/Typography/Shadow/Radius/Space), `classify()` + `tokensIn()` 헬퍼 + `Swatch/TextSample/BoxSample` 포팅.
- `apps/web`: Next.js 14 App Router 부트스트랩 — `layout.tsx` (Plus Jakarta/JetBrains/Fraunces `next/font/local` + `<html suppressHydrationWarning>` + `<head><ThemePrePaintScript/></head>` + `<ThemeProvider defaultMode="system">`), `src/app/slice/` preview shell, `src/app/slice/tokens/page.tsx` 쇼케이스 페이지.
- `scripts/gate-check.sh`: FE 체크 3종 추가 — `fe_token_hardcode` (apps/* & ui-kit raw hex 탐지, design-tokens 화이트리스트), `fe_slice_smoke` (dev server + curl /slice /slice/tokens 200), `fe_axe` (Playwright MCP 환경에서만 `FE_AXE=1` 로 실제 검증).
- `.claude/rules/pipeline.md`: FE 파이프라인 규칙 섹션 — 템플릿 분리(FE-CODEX-HANDOFF), TASK-ID `IMPL-UI-###` 규칙, Claude/Codex 하이브리드 분업 표(design-tokens=Claude, ui-kit primitives=Codex), Raw Hex 금지, DoD 근거 목록, HANDOFF 크기(신규×1.5+수정×1.0≤5).
- `pipeline/templates/FE-CODEX-HANDOFF.template.md`: FE 전용 Codex HANDOFF 템플릿 — BE 템플릿과 분리, Affected Paths 제한, anti-pattern(NodeNext `.js` 확장자, `next/*` import 금지, raw hex 금지).
- `.claude/hooks/`: pre-tool-safety + post-edit-lint + notify-done 훅 — Claude Code 작업 중 hook 기반 자동 검증.
- 파이프라인 블로커 해결 기록: `.worktrees/*` 가 HEAD(e6dec76) 기준 생성되나 신규 패키지 untracked → `codex:codex-rescue` subagent 를 in-place 실행으로 우회 (BE 파이프라인과 구분 기록).
- **검증 결과 (이전 세션 수행 완료)**: `pnpm --filter @celebbase/ui-kit typecheck/lint/build-storybook` 모두 exit 0, `pnpm turbo run typecheck` 11/11 PASS, `fe_token_hardcode` + `fe_slice_smoke` PASS, `/`/`/slice`/`/slice/tokens` 200, Storybook `index.json` 5 stories 등록, `grep "from 'next"` in ui-kit 0건.
### 미완료: Primitives 6 종 (Button/Input/Text/Stack/Card/Badge → IMPL-UI-002), `/slice/primitives` 쇼케이스 (→ IMPL-UI-002), CSS Modules 인프라 (→ IMPL-UI-002-P4), tokens.css 갭 (shadow-focus/border-strong/input-height/cta-text/radius-2xl → IMPL-UI-002-P2), i18n (next-intl), 관측성 (Sentry/PostHog), visual regression (Chromatic), E2E (Playwright), 기능 페이지 (로그인/플랜/결제/대시보드).
### 연관 파일: packages/ui-kit/, apps/web/, scripts/gate-check.sh, .claude/rules/pipeline.md, pipeline/templates/FE-CODEX-HANDOFF.template.md, DESIGN.md, DESIGN-claude.md, DESIGN-codex.md

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-UI-002-P2
commit_sha: 38ececa
files_changed:
  - packages/design-tokens/tokens.css
  - packages/design-tokens/scripts/verify-contrast.ts
  - packages/design-tokens/src/tokens.native.ts
verified_by: claude-opus-4-7
---
### 완료: tokens.css 갭 보강 (Primitives 선행) — IMPL-UI-002-P2
- 추가 토큰 (light+dark): `--cb-shadow-focus`, `--cb-border-strong/focus/error`, `--cb-button-pad-y/x`, `--cb-input-height`, `--cb-radius-2xl`, `--cb-cta-text` (총 +9, 63→72).
- `--cb-border-strong = var(--cb-neutral-400)` 로 설정 — light 3.43:1 / dark 3.42:1 (WCAG 2.1 non-text ≥3:1).
- `--cb-cta-text` 는 light 에서 `var(--cb-neutral-0)` (4.64:1 on brand-600), dark 에서는 brand-600 이 밝은 gold 로 뒤집히므로 `#1A1917` 하드코딩 (8.71:1).
- `packages/design-tokens/scripts/verify-contrast.ts` 신규: WCAG 2.1 상대 휘도 공식으로 light+dark 12 쌍 × 2 테마 = 24 쌍 자동 검증. `var()` 재귀 해결 + hex→RGB→linear → contrastRatio.
- 검증: `npx tsx scripts/verify-contrast.ts` → 24/24 pass (fail 0), `pnpm --filter @celebbase/design-tokens build` → emitted tokens.native.ts (light=72, dark=72, overrides=38), `pnpm turbo run typecheck` → 11/11 PASS.
### 미완료: Pre-Step 3 (fe_slice_smoke `/slice/primitives` 추가), Pre-Step 4 (CSS Modules 인프라), 6 HANDOFF 본 구현 (IMPL-UI-002 main).
### 연관 파일: packages/design-tokens/tokens.css, packages/design-tokens/scripts/verify-contrast.ts, packages/design-tokens/src/tokens.native.ts

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-UI-002-P3
commit_sha: e00e10f
files_changed:
  - scripts/gate-check.sh
verified_by: claude-opus-4-7
---
### 완료: fe_slice_smoke 라우트에 /slice/primitives 추가 — IMPL-UI-002-P3
- `scripts/gate-check.sh check_fe_slice_smoke` 의 route 루프에 `/slice/primitives` 추가.
- 초기 상태: 200 또는 404 허용 (쇼케이스 페이지 G3-b 이후 배치 예정).
- Follow-up 커밋 (IMPL-UI-002 G3-b 완료 후): `/slice/primitives` 200 필수 전환.
- Codex v2 리뷰 반영: 검증기 변경 + 기능 변경을 동일 커밋에 묶지 않기 위해 독립 커밋으로 분리.
### 미완료: Pre-Step 4 (CSS Modules 인프라), 6 HANDOFF 본 구현, 200 필수 전환 (G3-b 뒤 follow-up).
### 연관 파일: scripts/gate-check.sh

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-UI-002-P4
commit_sha: 45c480e
files_changed:
  - packages/ui-kit/src/types/css-modules.d.ts
  - packages/ui-kit/scripts/copy-css.mjs
  - packages/ui-kit/package.json
verified_by: claude-opus-4-7
---
### 완료: CSS Modules 인프라 셋업 — IMPL-UI-002-P4
- `packages/ui-kit/src/types/css-modules.d.ts`: ambient 선언 `declare module '*.module.css' { const classes: Readonly<Record<string, string>>; export default classes; }`. tsc 가 `.module.css` import 를 `Record<string,string>` 으로 인식하도록 함.
- `packages/ui-kit/scripts/copy-css.mjs`: `fs.readdir({ withFileTypes: true })` 재귀 walker — `src/**/*.module.css` → `dist/**/*.module.css` 복사. tsc 가 `.css` 를 emit 하지 않아 필요. Next.js(transpilePackages) 및 Vite(Storybook) 양쪽이 dist 에서 CSS Module 을 resolve 하도록 파일명 유지.
- `packages/ui-kit/package.json` `scripts.build`: `"tsc -p tsconfig.json && node scripts/copy-css.mjs"` 체인.
- `apps/web/next.config.ts` — 이미 `transpilePackages: ['@celebbase/ui-kit', '@celebbase/design-tokens']` 포함 확인, 변경 없음.
- **Probe 검증**: 임시 `src/__probe__/probe.module.css` + `probe.ts` 로 빌드 실행 → `dist/__probe__/probe.module.css` 복사 확인, typecheck PASS, 제거.
### 미완료: IMPL-UI-002 파이프라인 init + 6 chunk HANDOFF (Stack/Text/Button/Input/Card/Badge), `/slice/primitives` 쇼케이스.
### 연관 파일: packages/ui-kit/src/types/css-modules.d.ts, packages/ui-kit/scripts/copy-css.mjs, packages/ui-kit/package.json

---
date: 2026-04-17
agent: claude-opus-4-7 + codex (adversarial review ×7)
task_id: IMPL-014-d2
commit_sha: 7cbfa7b
files_changed:
  - services/meal-plan-engine/src/consumers/sqs_consumer.py
  - docker-compose.yml
  - services/meal-plan-engine/tests/integration/conftest.py
  - services/meal-plan-engine/tests/integration/test_dlq_retry.py
  - services/meal-plan-engine/tests/integration/test_ws_ticket_reuse.py
verified_by: claude-opus-4-7 + codex-review (Revision 7 GO)
---
### 완료: T2 DLQ retry + T3 WS ticket single-use E2E — IMPL-014-d2
- **T2 (DLQ retry)**: `meal_plans` row 에 valid `base_diet_id`(FK 만족) 삽입 후 SQS body 에만 phantom UUID 주입 → consumer 가 `content_client.get_base_diet(phantom)` 404 로 실패 → 1회 재시도 → terminal `status='failed'` + main queue drain. 실패 vector 위치: `sqs_consumer.py:62` (body 에서 `base_diet_id` 파싱) → `:74` (`get_base_diet` 호출). FK 충돌 방지를 위해 body 의 `base_diet_id` 만 phantom, DB row 는 `seed_base_diet["diet_id"]` 유지.
- **SQS visibility timeout 환경변수화**: `sqs_consumer.py` 모듈 스코프에 `_VISIBILITY_TIMEOUT = int(os.environ.get("SQS_VISIBILITY_TIMEOUT", "120"))` 추가, `:173` 의 하드코딩 120 을 `_VISIBILITY_TIMEOUT` 으로 교체. `docker-compose.yml` 의 meal-plan-engine 에 `SQS_VISIBILITY_TIMEOUT: "10"` 주입 → 재시도 창을 10초로 단축하여 60s 테스트 예산 안에 retry→terminal 경로 완주. 프로덕션 기본값 120 유지(Settings 에는 추가하지 않음 — 테스트 관심사 누수 방지).
- **T2 drain 검증 (LocalStack counter lag 대응)**: 단일 `get_queue_attributes` 읽기는 counter 가 한 polling cycle 지연되어 불안정 → 3회 연속 `ApproximateNumberOfMessages="0"` + `ApproximateNumberOfMessagesNotVisible="0"` (1s 간격, 최대 15s) 요구. 이어서 `receive_message(WaitTimeSeconds=1)` 공백 확인으로 이중 검증.
- **T3 (WS ticket single-use)**: `POST /ws/ticket` → 첫 WS connect 에서 `send("ping") → recv() → {"event":"pong"}` 2s 라운드트립 성공, 동일 ticket 재사용은 거부. `_validate_ticket` 이 Redis `GET → DEL` 순서로 ticket 을 즉시 소비(`websocket.py:32-46`) → 재사용 시 `close(code=4001)` 이 `accept()` 이전에 호출되어 Uvicorn 핸드셰이크에서 HTTP 403 매핑.
- **T3 rejection 경로 이원화**: Path A(HTTP 403 — `InvalidStatus` / `InvalidStatusCode`) 와 Path B(accept 후 `ConnectionClosedError`) 모두 수용. `websockets` v16.0 은 `InvalidStatus` 가 modern API(`exc.response.status_code`)이고 `InvalidStatusCode`(`exc.status_code`) 는 deprecated alias — 두 클래스 모두 isinstance 검사로 방어. `OSError`/`ConnectionRefusedError` 는 재던지기(fail-fast) — 컨테이너 다운을 "예상된 거부" 로 삼키지 않음.
- **T3 usable-session 정의 (Codex r2 Q4a)**: 첫 connect 성공은 `async with` 진입만으로는 불충분 — 명시적 pong payload 검증 필수. `recv()` 타임아웃은 usable 아님.
- **Codex 적대적 리뷰 7 라운드**: r1(queue 단일 read 불안정 → 3연속 zero drain) → r2(`send_text` 서버 API 혼동, OSError swallow 금지, vis=5→10) → r3(값 일관성, NOT NULL 컬럼 명시, JWT 값 명시) → r4(phantom `base_diet_id` FK 위반 → DB row 는 valid, body 만 phantom) → r5(fixture key `["diet_id"]`) → r6(FK fix 잔존 2곳, GET polling auth 누락) → r7(GO).
- **검증 결과**: 컨테이너 내 `_VISIBILITY_TIMEOUT=10` 확인, T1 regression PASS, T2+T3 PASS (14.43s), full integration 3/3, unit 64/64.
### 미완료: compose 기반 CI 통합 (→ IMPL-016), prod migration runner 분리 (→ IMPL-017+), multi-worker `_recover_stuck_plans` lease/heartbeat 패턴 (Phase B), WS ticket 멀티워커 `GET→DEL` atomicity (`_validate_ticket` Redis race — 현재 단일 워커 가정).
### 연관 파일: services/meal-plan-engine/src/consumers/sqs_consumer.py, docker-compose.yml, services/meal-plan-engine/tests/integration/conftest.py, services/meal-plan-engine/tests/integration/test_dlq_retry.py, services/meal-plan-engine/tests/integration/test_ws_ticket_reuse.py

---
date: 2026-04-17
agent: claude-opus-4-7 + codex-o3
task_id: IMPL-UI-002
commit_sha: 8ad4ee9
files_changed:
  - packages/ui-kit/src/components/Stack/Stack.tsx
  - packages/ui-kit/src/components/Stack/Stack.module.css
  - packages/ui-kit/src/components/Text/Text.tsx
  - packages/ui-kit/src/components/Text/Text.module.css
  - packages/ui-kit/src/components/Button/Button.tsx
  - packages/ui-kit/src/components/Button/Button.module.css
  - packages/ui-kit/src/components/Input/Input.tsx
  - packages/ui-kit/src/components/Input/Input.module.css
  - packages/ui-kit/src/components/Card/Card.tsx
  - packages/ui-kit/src/components/Card/Card.module.css
  - packages/ui-kit/src/components/Badge/Badge.tsx
  - packages/ui-kit/src/components/Badge/Badge.module.css
  - packages/ui-kit/stories/Stack.stories.tsx
  - packages/ui-kit/stories/Text.stories.tsx
  - packages/ui-kit/stories/Button.stories.tsx
  - packages/ui-kit/stories/Input.stories.tsx
  - packages/ui-kit/stories/Card.stories.tsx
  - packages/ui-kit/stories/Badge.stories.tsx
  - packages/ui-kit/src/index.ts
  - apps/web/src/app/slice/primitives/page.tsx
  - apps/web/src/app/slice/page.tsx
  - apps/web/src/app/slice/layout.tsx
  - scripts/gate-check.sh
verified_by: claude-opus-4-7 + codex-o3-review
---
### 완료: 6 Primitives (Stack/Text/Button/Input/Card/Badge) + /slice/primitives 쇼케이스 — IMPL-UI-002
- **구조**: 1 TASK-ID 단일 파이프라인 사이클, implement 단계만 6 chunk (G1-a/G1-b/G2-a/G2-b/G3-a/G3-b) 로 분할. 각 chunk 3 파일 (`<Name>.tsx` + `<Name>.module.css` + `<Name>.stories.tsx`), barrel 은 chunk 뒤 Claude 가 직접 패치. 파일 예산 3 × 1.5 = 4.5 ≤ 5 준수.
- **CSS Modules**: `.module.css` + `styles.*` 클래스 합성. pseudo-class (`:hover`, `:active`, `:focus-visible`, `:disabled`) 로만 상태 스타일링 — 모든 focus ring 은 `:focus-visible` 한정 (키보드 only). 공용 토큰 `var(--cb-shadow-focus)` 단일 키로 모든 primitive 에 적용.
- **a11y 기둥**:
  - Button: `aria-busy`/`disabled`/`loading` 스피너, touch target sm=44 md=52, Space/Enter native 동작.
  - Input: `<label htmlFor>`, `aria-invalid`/`aria-required`/`aria-describedby` error chain, required `*` 시각 표시.
  - Card: `interactive` + `as` 미지정 시 `role="button"` + `tabIndex=0` + Enter/Space 처리, line item `min-height:44px`.
  - Badge: toggle 패턴 — `selected` prop 존재 시 `aria-pressed="true"/"false"` 양쪽 emit (undefined 는 display-only). `onRemove` 시 내부 `<button aria-label="Remove">`. dot badge 는 `aria-label` 로 상태 설명.
  - Stack: layout-only, `as` prop 으로 semantic element (`section`, `ul`, `main` 등) 선택 가능.
  - Text: `as` 가 hierarchy 결정, display 계열 Fraunces, body/label Plus Jakarta, mono JetBrains.
- **쇼케이스**: `apps/web/src/app/slice/primitives/page.tsx` — 6 섹션 (Section helper + `aria-labelledby`), Input controlled 입력 + 빈 required 상태 DOM 렌더, Badge toggle + removable tag 라이브 상태. `/slice/primitives` SSR 200.
- **Follow-up 커밋** (`d3a6385`): `scripts/gate-check.sh` 의 `/slice/primitives` + `/slice/tokens` 를 200 필수로 전환 (Pre-Step 3 의 "200/404 허용" 과도 기간 종료).
- **Badge a11y 수정 (`c5f4680`)**: gate-qa 검증 중 발견 — 선택되지 않은 toggle chip 이 `aria-pressed` 를 누락 (`selected=false` 일 때 attribute 생략) → `aria-pressed="false"` 명시 emit 으로 수정. Display-only Badge (consumer 가 `selected` prop 자체를 안 줬을 때) 는 attribute 생략 유지.
- **검증 근거**:
  - `pnpm --filter @celebbase/ui-kit typecheck/lint/build` → 0 errors / 0 warnings / `dist/` + 6 .module.css copied.
  - `pnpm --filter web typecheck/lint` → 0 errors / "No ESLint warnings or errors".
  - `scripts/gate-check.sh fe_token_hardcode` → passed:true.
  - `scripts/gate-check.sh fe_slice_smoke` → passed:true (`/slice`, `/slice/tokens`, `/slice/primitives` 모두 200).
  - Static SSR DOM assertion suite (16/16 PASS): `h1 Primitives`, Fraunces 사용, `aria-pressed="true"` ×1 + `aria-pressed="false"` ×2, `aria-invalid/required` ×1, `role="button"` ×4, `aria-label="Remove"` ×3, dot Online/Pending/Offline, `aria-busy="true"`, disabled input, `#input-required-error`, `tabindex="0"`, `var(--cb-*)` 30+ 사용.
  - Codex o3 독립 리뷰: CRITICAL 0, HIGH 1 (FE DoD 에 unit-test 의무 없음 — out-of-scope 판정), MEDIUM 2 (pre-existing 코드 / slice preview 설계 의도 — out-of-scope), LOW 2 (이미 커버됨).
- **Playwright MCP 런타임 시나리오 (S1~S8 시각/회귀 부분)**: 본 세션에 MCP 미바인딩 → DOM 레벨 대체 QA 로 통과 판정, 시각 회귀 (dark SSR screenshot, focus-ring 시각, hover step-up, responsive 375/768/1440, axe JSON) 는 MCP 바인딩 세션으로 이월. QA-PLAN.md S1~S8 pass criteria 그대로 재사용 가능.
### 미완료: Playwright MCP 런타임 시각 QA 재실행 (S1/S2/S3/S4/S6/S7), gate-check.sh `policy` self-match 버그 (pre-existing, 별도 chore), `packages/design-tokens/scripts/*.ts` ESLint project-service 미커버 (pre-existing from IMPL-UI-001/P2, 별도 chore), `pipeline.sh step_review` 공백 경로 파싱 버그 (별도 chore), i18n/Sentry/Chromatic/E2E, 기능 페이지 (로그인/플랜/결제/대시보드).
### 연관 파일: packages/ui-kit/src/components/, packages/ui-kit/stories/, packages/ui-kit/src/index.ts, apps/web/src/app/slice/primitives/page.tsx, apps/web/src/app/slice/page.tsx, apps/web/src/app/slice/layout.tsx, scripts/gate-check.sh, pipeline/runs/IMPL-UI-002/

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-UI-003-P1
commit_sha: a9be8cd
files_changed:
  - scripts/gate-check.sh
verified_by: claude-opus-4-7
---
### 완료: /slice/composites smoke 엔트리 추가 (IMPL-UI-003 Pre-Step)
- `scripts/gate-check.sh` `check_fe_slice_smoke` 의 route 리스트에 `/slice/composites` 추가.
- 초기 허용: 200 OR 404 (legacy alias `/slice/components` 와 동일 그룹). G5 (SlotChip) 완료 후 showcase page.tsx 배치 + 별도 follow-up 커밋으로 200 필수 그룹으로 승격 예정.
- Pre-Step 커밋으로 검증기 변경과 기능 변경을 분리 (IMPL-UI-002 Pre-Step 3 전례).
### 미완료: G1~G5 composite chunks (InputField / SelectField / SegmentedControl / Chip / SlotChip), `/slice/composites/page.tsx` showcase, `chore(gate): require /slice/composites 200` follow-up.
### 연관 파일: scripts/gate-check.sh

---
date: 2026-04-18
agent: claude-opus-4-7 + codex-o3
task_id: IMPL-UI-003
commit_sha: 0f683d3
files_changed:
  - packages/ui-kit/src/components/InputField/InputField.tsx
  - packages/ui-kit/src/components/InputField/InputField.module.css
  - packages/ui-kit/src/components/SelectField/SelectField.tsx
  - packages/ui-kit/src/components/SelectField/SelectField.module.css
  - packages/ui-kit/src/components/SegmentedControl/SegmentedControl.tsx
  - packages/ui-kit/src/components/SegmentedControl/SegmentedControl.module.css
  - packages/ui-kit/src/components/Chip/Chip.tsx
  - packages/ui-kit/src/components/Chip/Chip.module.css
  - packages/ui-kit/src/components/SlotChip/SlotChip.tsx
  - packages/ui-kit/src/components/SlotChip/SlotChip.module.css
  - packages/ui-kit/src/components/SlotChip/SlotChipGroup.tsx
  - packages/ui-kit/src/hooks/useRovingTabIndex.ts
  - packages/ui-kit/src/index.ts
  - packages/ui-kit/stories/InputField.stories.tsx
  - packages/ui-kit/stories/SelectField.stories.tsx
  - packages/ui-kit/stories/SegmentedControl.stories.tsx
  - packages/ui-kit/stories/Chip.stories.tsx
  - packages/ui-kit/stories/SlotChip.stories.tsx
  - apps/web/src/app/slice/composites/page.tsx
verified_by: claude-opus-4-7 + codex-o3-review
---
### 완료: 5 Composites (InputField/SelectField/SegmentedControl/Chip/SlotChip) + SlotChipGroup wrapper + /slice/composites 쇼케이스 — IMPL-UI-003
- **구조**: 1 TASK-ID 단일 파이프라인 사이클, implement 단계 5 chunk (G1/G2/G3/G4/G5-a) + 쇼케이스 (G5-b, Codex 위임). 각 chunk 2~3 파일, barrel 은 chunk 후 Claude 직접 패치. 파일 예산 준수.
- **Primitive 재사용 원칙**: 모든 composite 는 primitive (`Stack`, `Text`, `Button`, `Input`, `Card`, `Badge`) 를 wrap — 스타일 토큰·a11y 계약 IMPL-UI-002 유지.
- **G1 InputField**: `<label htmlFor>` + helper/error dual-span + `aria-describedby={`${id}-error ${id}-helper`}` chain + `role="alert"` + `aria-live="polite"` + required 시각 `*`. Primitive `Input` 에 wrapper 로 계약 내재화.
- **G2 SelectField**: native `<select>` 단일 선택. placeholder = disabled option. `aria-invalid`/`aria-describedby` chain InputField 와 parity. multi-select 는 IMPL-UI-004 로 분리.
- **G3 SegmentedControl**: `role="radiogroup"` + `<button role="radio" aria-checked="true|false">` + roving tabindex. 키보드 `←/→/↑/↓/Home/End/Space/Enter`. 공용 `useRovingTabIndex` 훅 신설 (G5-a 공유).
- **G4 Chip**: toggle (`aria-pressed="true|false"` 양쪽 emit) + removable (`onRemove` 중첩 button with `aria-label="Remove {label}"`, stopPropagation). `min-height: 44px` (WCAG 터치 타깃).
- **G5-a SlotChip + SlotChipGroup**: wrapper 가 `role="radiogroup"` + `aria-label` emit → `React.Children.toArray` + `isValidElement` + `child.type === SlotChip` strict 검증 → `cloneElement` 로 `selected`/`onSelect`/`tabIndex`/`ref` 주입. 비-SlotChip 자식은 dev-only `console.warn` (eslint-disable-next-line 주석) + 렌더 제외. native `disabled` 사용 금지 → `aria-disabled="true"` 로 통일. Free badge · Full 상태 시각 토큰화.
- **`useRovingTabIndex` 공용 훅**: G3/G5-a 가 공유. 내부 `activeIndexRef` + `useEffect(value)` 로 controlled race 방지. disabled skip + wrap-around + Home/End. All-disabled 에지: `activeIndex = -1` + wrapper 에 `aria-disabled="true"` 힌트 + onKeyDown no-op. Re-entry fallback: `value 매칭 → lastActiveRef → 첫 enabled`. Barrel 에는 internal (노출 안 함).
- **쇼케이스 (`apps/web/src/app/slice/composites/page.tsx`)**: Codex o3 구현 (pipeline.md L186 규정). `'use client';` L1 선언 (RSC client boundary 위반 방지 — plan v3 Risk #9). 6 섹션 × (InputField 4 variants / SelectField 4 variants / SegmentedControl 3 instances incl. all-disabled / Chip 4 toggle+remove / SlotChipGroup 3 groups = 10 slots). 최종 barrel 는 Claude 가 정리.
- **검증 근거 (QA S1~S9)**:
  - S1 `pnpm --filter @celebbase/ui-kit typecheck/lint/build` → 0 errors / 0 warnings / `[ui-kit] copied 11 .module.css file(s) to dist` + 5 composite CSS 파일 dist/components 존재.
  - S2 `pnpm --filter web typecheck/lint/build` → 0 errors, `/slice/composites` prerendered static (4.27 kB / 111 kB).
  - S3 `scripts/gate-check.sh fe_token_hardcode` → passed:true.
  - S4 `scripts/gate-check.sh fe_slice_smoke` → passed:true (4 routes 200 — `/slice`, `/slice/tokens`, `/slice/primitives`, `/slice/composites`).
  - S5 Static SSR DOM assertion (11/11 contracts): `role="radiogroup"` ×6, `role="radio"` ×24, `aria-checked="true"` ×6 / `"false"` ×18, `aria-pressed="true"` ×3 / `"false"` ×3, `aria-invalid="true"` ×2, `aria-required="true"` ×2, `aria-disabled="true"` ×7, `role="alert"` ×2, `tabindex="0"` ×5 (roving exactly-one-per-enabled-group).
  - S6 Codex o3 독립 리뷰: CRITICAL 0, HIGH 0, MEDIUM 1 (test-coverage — IMPL-UI-002 precedent out-of-scope: Storybook + /slice/composites smoke + optional axe 커버), LOW 2 (dev-guarded console.warn, presentational magic number — accept).
  - S8/S9 SegmentedControl/SlotChipGroup 키보드 nav: MCP unbound → S5 DOM grep fallback (roving tabindex + aria-disabled group 검증 완료), 전체 keyboard trace 이월.
  - S7 `fe_axe`: DEFERRED (MCP unbound, 이월).
- **gate-qa 자동 체크**: typecheck/build/test/policy/secrets/fake_stubs/sql_schema/phi_audit/migration_freshness/fe_token_hardcode/fe_axe 모두 pass. 유일한 FAIL `@celebbase/design-tokens#lint` 는 `scripts/*.ts` project-service 미커버 — IMPL-UI-001/P2 누적 pre-existing issue (IMPL-UI-002 LESSONS §안티패턴 5) → out-of-scope Claude pass 판정.
- **Plan v3 반영**: `SlotChipGroup` wrapper 포함 (고아 radio 방지), `useRovingTabIndex` 공유 훅으로 중복 구현 제거, `'use client';` 조항 G5-b HANDOFF 내 명시, `SelectField` single-select 전용으로 scope 축소 (multi-select → IMPL-UI-004).
### 미완료: IMPL-UI-004 `PillMultiSelect` (allergen pill grid, G2 scope 분리), axe/Playwright MCP 런타임 시각 QA (S7 이월), 기능 페이지 (로그인/플랜/결제/대시보드).
### 연관 파일: packages/ui-kit/src/components/{InputField,SelectField,SegmentedControl,Chip,SlotChip}, packages/ui-kit/src/hooks/useRovingTabIndex.ts, packages/ui-kit/src/index.ts, packages/ui-kit/stories/, apps/web/src/app/slice/composites/page.tsx, pipeline/runs/IMPL-UI-003/

---
date: 2026-04-18
agent: claude-opus-4-7
task_id: IMPL-UI-003-P2
commit_sha: 5091bd7
files_changed:
  - scripts/gate-check.sh
verified_by: claude-opus-4-7
---
### 완료: /slice/composites 200 필수 승격 (IMPL-UI-003 follow-up)
- `check_fe_slice_smoke` 의 `/slice/composites` 를 "200 OR 404 허용" 전이 그룹에서 "200 필수" 그룹으로 이관.
- G5-b 쇼케이스 page.tsx 가 merge 1620ce6 에 포함되어 상시 200 반환 — P1 전이 허용 종료.
- IMPL-UI-002-P3 승격 전례 재사용 (검증기 변경과 기능 변경 분리).
### 미완료: 없음.
### 연관 파일: scripts/gate-check.sh

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-APP-000a
commit_sha: 121047f
files_changed:
  - services/user-service/package.json
  - services/user-service/scripts/seed-demo-user.ts
  - services/meal-plan-engine/scripts/seed-demo-plan.py
  - scripts/seed-demo-all.sh
  - pnpm-lock.yaml
verified_by: claude-opus-4-7
---
### 완료: 서비스 경계 준수 데모 seed 스크립트 (plan v3 A11 / CRITICAL R2-C2)
- `services/user-service/scripts/seed-demo-user.ts` — `pg.Pool` + 트랜잭션으로 demo user (`cognito_sub='dev-demo-seed-user'`, email=`demo@celebbase.local`, tier=premium) 및 premium subscription (365일) idempotent upsert. stdout 에 `USER_ID=<uuid>` 한 줄 emit, stderr 에 진단 로그. user-service DB (users/subscriptions) 에만 write.
- `services/meal-plan-engine/scripts/seed-demo-plan.py` — asyncpg 로 `DEMO_USER_ID` env (없으면 cognito_sub fallback) 해결 + 첫 active `base_diets` SELECT (read-only cross-service) + `meal_plans` 에 `status='completed'`, `daily_plans` 7일 (4 meal/day: breakfast/lunch/dinner/snack with totals) JSONB upsert. Python 네이티브 (meal-plan-engine 의 언어 스택) 선택 근거: user-service node_modules 를 service 경계 밖에서 건드리지 않기 위함.
- `scripts/seed-demo-all.sh` — `set -euo pipefail` 오케스트레이터. user seed stdout 의 `USER_ID=` 파싱 → `DEMO_USER_ID` env 로 plan seed 에 전달. `PY_BIN` 자동 선택 (venv → system python3) 및 asyncpg import 가능 여부 preflight.
- `services/user-service/package.json` devDependency `pg@^8.13.0` 추가 (기존 `@types/pg` 는 있었으나 runtime 누락 → ERR_MODULE_NOT_FOUND 해결). `pnpm install --lockfile-only` 로 lockfile 동기화.
- **DoD 검증 근거 (2026-04-17 live postgres, celebase_ws-postgres-1)**:
  - 1회차 `bash scripts/seed-demo-all.sh` exit 0 (user_id=`019d9f51-db82-…`, plan_id=`019d9f52-4789-…`).
  - 2회차 동일 ID 재생성 (`ON CONFLICT` + `SELECT-before-INSERT` 로 idempotent).
  - SQL 검증: `users` tier=premium deleted_at NULL, `subscriptions` tier=premium status=active cancel_at_period_end=false, `meal_plans` status=completed start/end 2026-04-18…24 `jsonb_array_length(daily_plans)=7`.
  - 서비스 경계: user seed 는 users/subscriptions 만, plan seed 는 meal_plans 만 INSERT/UPDATE (base_diets 는 read-only SELECT, plan v3 A11 허용).
- **향후 사용처**: `apps/web/e2e/global-setup.ts` 가 `execSync('bash scripts/seed-demo-all.sh')` 로만 invoke (IMPL-APP-006). E2E 에서 multi-service DB 직접 write 금지 (plan v3 A11 enforcement).
### 미완료: IMPL-APP-000b (gate-check.sh fe_bff_compliance/smoke/contract + .semgrep.yml + verify-api-contracts.ts), Sprint A (001a/b/c).
### 연관 파일: services/user-service/scripts/, services/meal-plan-engine/scripts/, scripts/seed-demo-all.sh

---
date: 2026-04-17
agent: claude-opus-4-7
task_id: IMPL-APP-000b
commit_sha: 0504f46
files_changed:
  - scripts/gate-check.sh
  - scripts/eslint-bff.config.mjs
  - .semgrep.yml
  - apps/web/scripts/verify-api-contracts.ts
verified_by: claude-opus-4-7
---
### 완료: FE BFF 게이트 인프라 (plan v3 A9 / A10 / R2-M3)
- `scripts/gate-check.sh` 에 3개 gate case 추가 — `fe_bff_compliance` / `fe_bff_smoke` / `fe_contract_check`. `all` 에는 **미포함** (dev server / docker-compose / 선택 바이너리 의존).
- **fe_bff_compliance** — 3-way 검증 aggregate: (a) ESLint 9 flat config + `--config scripts/eslint-bff.config.mjs` + `--no-error-on-unmatched-pattern` 로 `no-restricted-syntax` 적용 (Literal `http(s)://(localhost|127.0.0.1):(3001|3002|3003)` + TemplateElement 두 selector). `apps/web/src/app/api/**` 는 ignores 로 제외. (b) Semgrep `.semgrep.yml` — `generic` 언어 + `pattern-regex: 'localhost:(3001|3002|3003)'` + `paths.include`/`paths.exclude` 로 BFF 라우트 제외. semgrep 바이너리 부재 시 advisory-skip. (c) grep 폴백 `localhost:300[123]` (`--exclude-dir=api`). 어느 reporter 라도 fail → 전체 fail.
- **scripts/eslint-bff.config.mjs** — ESLint 9 플랫 config 독립 파일. `typescript-eslint` parser + `apps/web/src/**/*.{ts,tsx,js,jsx,mjs,cjs}` 스코프. web 워크스페이스의 메인 eslint config 에 주입하지 않음 (게이트 전용 격리).
- **.semgrep.yml** — repo 루트. `no-direct-service-fetch` 룰 (ERROR). `paths.include`: apps/web/src 의 ts/tsx/js/jsx. `paths.exclude`: apps/web/src/app/api/**.
- **fe_bff_smoke** — curl+`%{http_code}` 로 4개 핵심 라우트 probe: `/api/celebrities` 200, `/api/users/me` 401, `POST /api/auth/login` (invalid creds) 200|400|401, `/api/meal-plans/<zero-uuid>` 401|404. dev server + backend docker-compose 외부 기동 전제 (fe_slice_smoke 패턴). `FE_BFF_BASE` env 로 base URL 오버라이드.
- **fe_contract_check** — `apps/web/scripts/verify-api-contracts.ts` 위임. 스크립트는 `@celebbase/shared-types` dynamic import + `safeParse` 로 6개 MVP 엔드포인트 Zod 검증. tsx 미설치 또는 shared-types 미출현 시 **SKIP marker + exit 0** (IMPL-APP-001a 전에도 gate 인프라 배치 가능). shared-types 스키마가 들어오면 그 즉시 자동 enforce.
- **DoD 검증 근거 (2026-04-17 local)**:
  - Clean tree `fe_bff_compliance`: `{"status":"pass",…"clean — 3-way BFF compliance check passed (eslint + semgrep + grep)"}`.
  - Synthetic violation (`apps/web/src/app/test-fake.ts` with `fetch("http://localhost:3001/users")`) → exit 1 + eslint/semgrep/grep 3 reporter 모두 감지 (각 reporter 출력 확인 후 파일 제거).
  - `fe_contract_check` pre-001a: SKIP path 통과 (`tsx not yet installed. Gate infra ready; enforcement activates after IMPL-APP-001a`).
  - `fe_bff_smoke` server-down: 모든 probe `000` → exit 1 (기대 동작). Sprint A BFF 핸들러 랜딩 이후 enforce.
  - `bash -n scripts/gate-check.sh` 통과. 702→885 line diff, 3 함수 추가 + 3 case 디스패치 + Available 에러 메시지 업데이트, `all` 블록은 변경 없음 (DoD 명시: 새 3 gate 미포함).
- **계획 근거**: `.claude/plans/adaptive-mixing-creek.md` §A9 (BFF 위반 3중 방어) / §A10 (contract drift 검증) / Sprint 0 IMPL-APP-000b DoD / Risk #16 / Risk #18.
### 미완료: Sprint A (IMPL-APP-001a deps+env+shared-types schemas+API client, 001b BFF route handlers, 001c providers+layouts).
### 연관 파일: scripts/gate-check.sh, scripts/eslint-bff.config.mjs, .semgrep.yml, apps/web/scripts/verify-api-contracts.ts

---
date: 2026-04-18
agent: claude-opus-4-7
task_id: CHORE-002
commit_sha: e43f089
files_changed:
  - .github/workflows/ci.yml
  - scripts/gate-check.sh
  - packages/design-tokens/tsconfig.scripts.json
  - packages/design-tokens/scripts/build.ts
  - packages/design-tokens/scripts/verify-contrast.ts
  - packages/design-tokens/package.json
  - eslint.config.mjs
  - services/meal-plan-engine/pytest.ini
  - services/meal-plan-engine/tests/integration/conftest.py
  - services/meal-plan-engine/tests/integration/test_e2e_happy_path.py
  - services/meal-plan-engine/tests/integration/test_dlq_retry.py
  - services/meal-plan-engine/tests/integration/test_ws_ticket_reuse.py
  - services/meal-plan-engine/package.json
  - apps/web/src/app/slice/primitives/page.tsx
  - apps/web/src/app/slice/composites/page.tsx
  - pnpm-lock.yaml
  - docs/IMPLEMENTATION_LOG.md
verified_by: agent-claude-opus-4-7 + agent-codex-r1r2r3 + agent-gemini-r1r2r3 + agent-plan-agent-r1
---
### 완료: CI baseline rescue — hashFiles 오용 제거, policy DRY 통합, design-tokens scripts 타입체크 복구, pytest integration marker 기본 skip, meal-plan-engine turbo test pickup
- `.github/workflows/ci.yml` lint-typecheck / test job-level `if: hashFiles(...)` 삭제 (7개월간 0s-fail 원인). step-level line 151 유지.
- `validate-compliance` 인라인 deny-pattern scan (28줄) → `bash scripts/gate-check.sh policy` 1줄 + `GITHUB_EVENT_BEFORE` env 주입으로 DRY 통합.
- `scripts/gate-check.sh check_policy()` 5-branch diff base 폴백 체인 (PR → push → origin/main → main → HEAD~1) + SELF_EXCLUDE self-match 방지 + 빈 RESULTS 배열 early-return 시 unbound variable 버그 수정 + SQL-destructive 패턴 (`DROP TABLE` / `TRUNCATE`) 의 tests/ 경로 예외 (test fixture cleanup legitimate — 첫 CI 실행에서 surfaced).
- `packages/design-tokens/tsconfig.scripts.json` (NEW) + `eslint.config.mjs` 4th entry (`projectService: false` 명시적 override) → `packages/design-tokens/scripts/*.ts` ESLint project-service 블라인드 스팟 해소.
- scripts/*.ts의 기존 lint 에러 7건 수정 (non-null assertion 제거, template literal number 변환).
- `services/meal-plan-engine/pytest.ini` markers 정의 (addopts `-m` 미사용 — CLI 충돌 방지) + `tests/integration/conftest.py` 모듈-레벨 `pytest.skip(allow_module_level=True)` — `LOCALSTACK_ENDPOINT` 미설정 시 통합 테스트 자동 스킵.
- 3개 integration 테스트 파일에 `pytestmark = pytest.mark.integration` 추가.
- `services/meal-plan-engine/package.json` (NEW) + `pnpm-lock.yaml` 재생성 → turbo가 meal-plan-engine pytest를 test pipeline에 포함.
- CI `test` job에 Python venv setup 3-step (setup-python / pip install / GITHUB_PATH prepend) 추가 — D4 per R2 diagnostic.
- 로컬 검증: `pnpm --filter design-tokens lint` 0 errors, `pnpm turbo run test --filter @celebbase/meal-plan-engine` 64 passed / 1 skipped, `bash scripts/gate-check.sh policy` exit 0.
- R1/R2/R3 Codex + Gemini 적대적 리뷰 수렴: 4 BLOCKING + 2 HIGH + 6 MEDIUM + 3 LOW + 3 CORR 모두 반영.
- 실제 CI 활성화 과정에서 surfaced 4 follow-up fix (plan 외 수정):
  1. `scripts/gate-check.sh` SQL-destructive DENY 패턴의 tests/ 경로 예외 (첫 CI 실행에서 meal-plan-engine/tests/integration/conftest.py `TRUNCATE` false positive)
  2. `services/meal-plan-engine/package.json` lint script — ruff 대신 `echo` (Node turbo lint job에 ruff 없음, root ruff step이 커버)
  3. `pnpm-lock.yaml` — IMPL-APP-001a(18fdd2f) 커밋이 jose/pino/pino-pretty 추가하고 lockfile 업데이트 누락 → 재생성 (+21 packages)
  4. `packages/design-tokens/package.json` typecheck — `tsx scripts/build.ts` 선행 (tokens.native.ts는 generated, untracked)
  5. `apps/web/src/app/slice/{primitives,composites}/page.tsx` onChange 핸들러 4곳 — `(e: ChangeEvent<HTMLInputElement>)` 타입 명시 (@typescript-eslint/no-unsafe-argument / no-unsafe-member-access)
- CI 최종 상태 (PR #3): 6 required checks 전부 pass (validate-docs / validate-schemas / validate-compliance / contract-tests / security-scan / require-log-entry). 3 non-required 실패 — follow-up chore로 기록:
  - `🧹 Lint & Typecheck`: user-service의 IMPL-012 기존 에러 13건 (이전엔 hashFiles 가드로 미실행, 이번에 surfaced)
  - `📊 Generate Progress`: 워크플로우 내 stale repo URL(`jjjjjuunn/celebase_ws` 유효) 참조 문제 — 기존 debt
  - `⚠️ Notify on Failure`: 위 두 실패 전파
### 미완료: Phase C (IMPL-016 rebase), Phase D (default branch 전환 + branch protection), CHORE-003 (required checks 확장, turbo.json explicit inputs), CHORE-004 (user-service IMPL-012 lint 13건 정리), CHORE-005 (LocalStack 통합 테스트 자동화)
### 연관 파일: .github/workflows/ci.yml, scripts/gate-check.sh, packages/design-tokens/{tsconfig.scripts.json,scripts/,package.json}, eslint.config.mjs, services/meal-plan-engine/{package.json,pytest.ini,tests/integration/}, apps/web/src/app/slice/{primitives,composites}/page.tsx, pnpm-lock.yaml

---
date: 2026-04-19
agent: claude-sonnet-4-6
task_id: IMPL-APP-001b-1b
commit_sha: 2d71a2f
files_changed:
  - apps/web/src/app/api/_lib/__tests__/session.test.ts
  - apps/web/src/app/api/_lib/__tests__/error.test.ts
  - apps/web/jest.config.cjs
  - apps/web/jest.setup.ts
  - apps/web/eslint.config.mjs
  - apps/web/package.json
  - apps/web/tsconfig.test.json
  - packages/eslint-plugin-celebbase/src/index.ts
  - packages/eslint-plugin-celebbase/src/rules/protected-route-factory.ts
  - packages/eslint-plugin-celebbase/package.json
  - packages/eslint-plugin-celebbase/tsconfig.json
verified_by: claude-sonnet-4-6
---
### 완료: BFF 단위 테스트 + ESLint 보호 규칙 (IMPL-APP-001b-1b)
- session.test.ts (11 tests): cookie 부재 401, JWTExpired X-Token-Expired header, 유효 토큰 session 주입, x-request-id 전파/생성, handler throw → 500
- error.test.ts (11 tests): BffError allowlist 필터, stack 드롭, retryable/retry_after 통과, PHI(biomarkers/medical_conditions) meta 차단, ZodError → 502, Error → 500, X-Request-Id 항상 포함
- jest.config.cjs + tsconfig.test.json: ts-jest CJS 모드, moduleResolution:node, server-only mock, .js 확장자 스트립
- jest.setup.ts: setupFiles로 module-scope readEnv() 호출 전 env 변수 설정
- eslint.config.mjs: ESLint v9 flat config, FlatCompat(next/core-web-vitals), @celebbase/eslint-plugin-celebbase
- packages/eslint-plugin-celebbase: AST 기반 protected-route-factory 규칙 (users/meal-plans/ws-ticket 경로에 createProtectedRoute 강제)
### 미완료: 없음 (001b-2부터 BFF 라우트 청크 진행)
### 연관 파일: apps/web/src/app/api/_lib/__tests__/, apps/web/eslint.config.mjs, packages/eslint-plugin-celebbase/

---
date: 2026-04-19
agent: claude-sonnet-4-6
task_id: IMPL-APP-001b-2
commit_sha: 59e26fc
files_changed:
  - apps/web/src/app/api/auth/login/route.ts
  - apps/web/src/app/api/auth/signup/route.ts
  - apps/web/src/app/api/auth/refresh/route.ts
  - apps/web/package.json
verified_by: claude-sonnet-4-6
---
### 완료: BFF 인증 라우트 — login/signup/refresh (IMPL-APP-001b-2)
- login/route.ts: POST /api/auth/login → user-service /auth/login; cb_access(900s)/cb_refresh(30d) httpOnly SameSite=Lax 쿠키 설정; body: { user }
- signup/route.ts: POST /api/auth/signup → user-service /auth/signup; 동일 쿠키 플로우; 201 반환
- refresh/route.ts: POST /api/auth/refresh → cb_refresh 쿠키 읽어 user-service /auth/refresh 호출; 401/403 시 쿠키 클리어; 성공 시 양 쿠키 교체
- apps/web/package.json: @celebbase/shared-types workspace:* 의존성 추가 (auth/users 스키마 임포트 필수)
- 모든 라우트 createPublicRoute 래핑, fetchBff Result<T> 패턴, LoginResponseSchema/SignupResponseSchema/RefreshResponseSchema Zod 검증
### 미완료: 없음 (001b-3: logout+users/me+bio-profile 진행)
### 연관 파일: apps/web/src/app/api/auth/, apps/web/package.json

---
date: 2026-04-19
agent: claude-sonnet-4-6
task_id: IMPL-010-c
commit_sha: 3972f90
files_changed:
  - .env.example
  - services/user-service/src/env.ts
  - services/user-service/src/services/auth.service.ts
  - services/user-service/src/index.ts
  - services/meal-plan-engine/src/config.py
  - services/meal-plan-engine/src/routes/meal_plans.py
  - apps/web/src/app/api/_lib/session.ts
  - apps/web/jest.setup.ts
  - apps/web/src/app/api/_lib/__tests__/session.test.ts
  - .github/workflows/ci.yml
  - docker-compose.yml
  - services/meal-plan-engine/tests/unit/test_meal_plan_routes.py
  - services/meal-plan-engine/tests/integration/conftest.py
verified_by: claude-sonnet-4-6
---
### 완료: IMPL-010-c — Env 계약 통일 + BFF 내부 JWT 회귀
- JWT_SECRET → INTERNAL_JWT_SECRET 전수 rename (user-service, meal-plan-engine, BFF, docker-compose, CI)
- .env.example: AUTH_PROVIDER=dev, COGNITO_* 네이밍 통일, INTERNAL_JWT_SECRET/ISSUER 추가
- env.ts: Zod superRefine — AUTH_PROVIDER=cognito 시 Cognito 5개 vars 필수, prod에서 AUTH_PROVIDER=dev 금지, COGNITO_JWKS_URI regex allowlist
- config.py: JWT_SECRET → INTERNAL_JWT_SECRET, AUTH_PROVIDER 추가, model_validator 업데이트
- session.ts: JWKS RS256 회귀 → 내부 HS256 (IMPL-005 premature revert), module-load throw 제거
- session.test.ts: createRemoteJWKSet mock 제거, cognito_sub payload 픽스처 업데이트 (22 tests pass)
- CI job env: AUTH_PROVIDER=dev + INTERNAL_JWT_SECRET 주입
- pytest unit 64 pass, web jest 22 pass, gate-check policy pass
### 미완료: IMPL-010-d (CognitoAuthProvider + email-bridge), IMPL-010-e (rate-limit + logout + 관찰성)
### 연관 파일: services/user-service/src/env.ts, services/meal-plan-engine/src/config.py, apps/web/src/app/api/_lib/session.ts

---
date: 2026-04-19
agent: claude-sonnet-4-6
task_id: IMPL-APP-001b-3
commit_sha: 079926e
files_changed:
  - apps/web/src/app/api/auth/logout/route.ts
  - apps/web/src/app/api/users/me/route.ts
  - apps/web/src/app/api/users/me/bio-profile/route.ts
  - apps/web/eslint.config.mjs
verified_by: claude-sonnet-4-6
---
### 완료: BFF logout + users/me + bio-profile 라우트 (IMPL-APP-001b-3)
- logout/route.ts: POST /api/auth/logout → cb_access(Max-Age=0)/cb_refresh(Max-Age=0) 쿠키 클리어; 204 반환; createPublicRoute 래핑
- users/me/route.ts: GET /api/users/me → MeResponseSchema 검증; PATCH /api/users/me → UpdateMeRequestSchema 검증 후 전달; createProtectedRoute 래핑
- users/me/bio-profile/route.ts: GET/POST/PATCH/DELETE 4메서드; 각 PHI 감사 컨텍스트(x-forwarded-for, userId) fetchBff에 전달; POST 201 / GET+PATCH 200; createProtectedRoute 래핑
- eslint.config.mjs: CJS→ESM interop 수정 (_celebbasePlugin.default ?? _celebbasePlugin) — Node.js native ESM은 __esModule을 무시하므로 .default 언래핑 필수
### 미완료: 없음 (001b-4: celebrities public routes 진행)
### 연관 파일: apps/web/src/app/api/auth/logout/, apps/web/src/app/api/users/, apps/web/eslint.config.mjs

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001b-4
commit_sha: 81a47a3
files_changed:
  - apps/web/src/app/api/celebrities/route.ts
  - apps/web/src/app/api/celebrities/[slug]/route.ts
  - apps/web/src/app/api/celebrities/[slug]/diets/route.ts
verified_by: claude-opus-4-7
---
### 완료: BFF celebrities public 라우트 (IMPL-APP-001b-4)
- celebrities/route.ts: GET /api/celebrities → content-service /celebrities{search} (query-string 투명 pass-through); CelebrityListResponseSchema 검증; createPublicRoute 래핑
- celebrities/[slug]/route.ts: GET /api/celebrities/:slug → content-service /celebrities/{slug}; CelebrityDetailResponseSchema 검증; Next.js 15 dynamic route 패턴(params: Promise<{slug}>, await 후 createPublicRoute 인라인 호출)
- celebrities/[slug]/diets/route.ts: GET /api/celebrities/:slug/diets → content-service /celebrities/{slug}/diets; CelebrityDietsResponseSchema 검증; 동일 동적 라우트 패턴
- 모든 라우트: x-request-id/x-forwarded-for 전파, fetchBff Result<T> 패턴, 인증 없음 (content-service 공개 엔드포인트)
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass / `scripts/gate-check.sh fe_bff_compliance` {passed:true}
### 미완료: 없음 (001b-5: base-diets + recipes public routes 진행)
### 연관 파일: apps/web/src/app/api/celebrities/

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001b-5
commit_sha: ce5f78a
files_changed:
  - apps/web/src/app/api/base-diets/[id]/route.ts
  - apps/web/src/app/api/recipes/route.ts
  - apps/web/src/app/api/recipes/[id]/route.ts
verified_by: claude-opus-4-7
---
### 완료: BFF base-diets + recipes public 라우트 (IMPL-APP-001b-5)
- base-diets/[id]/route.ts: GET /api/base-diets/:id → content-service /base-diets/{id}; BaseDietDetailResponseSchema 검증; Next.js 15 dynamic route 패턴
- recipes/route.ts: GET /api/recipes → content-service /recipes{search} (query-string 투명 pass-through); RecipeListResponseSchema 검증
- recipes/[id]/route.ts: GET /api/recipes/:id → content-service /recipes/{id}; RecipeDetailResponseSchema 검증; 동적 라우트
- 모든 라우트: createPublicRoute 래핑, fetchBff Result<T> 패턴, x-request-id/x-forwarded-for 전파, 인증 없음
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass (기존 logout route `_req` 경고만 carry-over) / `scripts/gate-check.sh fe_bff_compliance` {passed:true}
### 미완료: 없음 (001b-6: meal-plans core protected routes 진행)
### 연관 파일: apps/web/src/app/api/base-diets/, apps/web/src/app/api/recipes/

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001b-6
commit_sha: f3d719a
files_changed:
  - apps/web/src/app/api/meal-plans/route.ts
  - apps/web/src/app/api/meal-plans/[id]/route.ts
verified_by: claude-opus-4-7
---
### 완료: BFF meal-plans core protected 라우트 (IMPL-APP-001b-6)
- meal-plans/route.ts: GET /api/meal-plans → meal-plan-engine /meal-plans{search} (cursor pagination 투명 pass-through, MealPlanListResponseSchema 검증); POST /api/meal-plans → meal-plan-engine /meal-plans/generate (GenerateMealPlanRequestSchema 입력 검증, GenerateMealPlanResponseSchema 출력 검증, 30s timeout — generation은 RS256 JWT + 쿼터 + SQS enqueue로 5s 초과 가능)
- meal-plans/[id]/route.ts: GET /api/meal-plans/:id → meal-plan-engine /meal-plans/{id} (MealPlanDetailResponseSchema 검증); DELETE /api/meal-plans/:id → meal-plan-engine /meal-plans/{id} (BE 204 응답을 EmptyBodySchema=z.object({}).passthrough()로 통과시킨 뒤 BFF도 204 No Content 반환); Next.js 15 dynamic route 패턴(params: Promise<{id}>, await 후 createProtectedRoute 인라인 호출)
- 모든 라우트: createProtectedRoute 래핑(jose RS256 JWT 검증), session.user_id를 fetchBff userId로 전달(per-user rate-limit + PHI audit propagation), x-request-id/x-forwarded-for 전파
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass (기존 logout route `_req` 경고만 carry-over) / `scripts/gate-check.sh fe_bff_compliance` {passed:true}
### 미완료: 없음 (001b-7: regenerate + ws-ticket 진행)
### 연관 파일: apps/web/src/app/api/meal-plans/

---
date: 2026-04-18
agent: claude-opus-4-7
task_id: IMPL-010-d
commit_sha: 1371ddf
files_changed:
  - services/user-service/src/services/cognito-auth.provider.ts
  - services/user-service/src/services/auth.service.ts
  - services/user-service/src/repositories/user.repository.ts
  - services/user-service/src/index.ts
  - services/user-service/tests/unit/auth.service.test.ts
  - services/user-service/tests/unit/cognito-auth.provider.test.ts
  - services/user-service/tests/unit/user.repository.test.ts
  - packages/service-core/tests/helpers/mock-jwks-server.ts
verified_by: claude-opus-4-7
---
### 완료: IMPL-010-d — CognitoAuthProvider + email-bridge (dormant build)
- CognitoAuthProvider: jose `createRemoteJWKSet` RS256 검증, issuer/audience pin, `algorithms: ['RS256']` (alg confusion 방어), `clockTolerance: 60`, `token_use === 'id'` 강제, sub/email claim non-empty 확인; jose 에러 → 통일된 `UnauthorizedError('Invalid or expired id token')` (user enumeration 방어)
- auth.service.ts 리팩터: `AuthTokenSubject {sub, email, cognito_sub}` 인터페이스 도입, `issueInternalTokens` / `verifyInternalRefresh` 공용 헬퍼로 DevAuthProvider/CognitoAuthProvider 모두 내부 HS256 JWT 발급; issuer 기본값 `celebbase-user-service` (BFF session.ts 기대값과 정합)
- Email-bridge (D9): signup/login 에서 `findByCognitoSub` miss → `findAndUpdateCognitoSubByEmail` 로 기존 dev-<uuid> 유저 cognito_sub 원자 업데이트; `cognito_sub LIKE 'dev-%'` SQL 조건으로 이미 Cognito sub 설정된 유저는 건너뜀; unique_violation (23505) → null 반환 (race 방어)
- user.repository.ts: `findAndUpdateCognitoSubByEmail(pool, email, cognito_sub)` 추가 — atomic UPDATE + RETURNING
- index.ts: `AUTH_PROVIDER=cognito` 시 CognitoAuthProvider 인스턴스화, 5-field non-empty 가드 + `NODE_ENV=production && AUTH_PROVIDER !== 'cognito'` fatal exit (3-layer: superRefine + runtime fatal + loadDevSecret)
- Mock JWKS server: `packages/service-core/tests/helpers/mock-jwks-server.ts` (test-only, dist 미포함) — `node:http` + jose RS256 keypair + `mintIdToken({sub, email, token_use, issuer, audience, expiresIn, kid})`
- 테스트: 82 user-service unit tests pass (coverage 80.89% — 신규 `user.repository.test.ts` 로 80% 문턱 확보), Cognito provider 9-case (valid/wrong-aud/wrong-iss/access-token/expired/unknown-kid/garbage/missing-email/refresh 보존), email-bridge 4-case (signup merge/login fallback/conflict/404)
- Scope: Phase B 는 서버 dormant build — CLIENT-COGNITO-001 + CHORE-006 완료 전까지 staging/prod `AUTH_PROVIDER=dev` 유지. `@aws-sdk/client-cognito-identity-provider` 미추가 (Hosted UI/Amplify 가 클라이언트사이드 signup 처리)
### 미완료: IMPL-010-e (rate-limit per-route + /auth/logout + structured auth logs)
### 연관 파일: services/user-service/src/services/, services/user-service/src/repositories/user.repository.ts, packages/service-core/tests/helpers/

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001b-7
commit_sha: 7f5d5c1
files_changed:
  - apps/web/src/app/api/meal-plans/[id]/regenerate/route.ts
  - apps/web/src/app/api/ws-ticket/route.ts
verified_by: claude-opus-4-7
---
### 완료: BFF regenerate + ws-ticket protected 라우트 (IMPL-APP-001b-7)
- meal-plans/[id]/regenerate/route.ts: POST → meal-plan-engine `/meal-plans/{id}/regenerate` (RegenerateMealPlanRequestSchema passthrough 입력 검증, RegenerateMealPlanResponseSchema `{id, status}` 출력 검증). 202 Accepted 반환(큐잉 시맨틱). Next.js 15 dynamic route params `Promise<{id}>` await 후 createProtectedRoute 인라인 호출.
- ws-ticket/route.ts: POST → user-service `/ws/ticket` (BE 응답 `{ticket, expires_in_sec}`을 intermediate schema로 먼저 검증). BFF가 D6 per `meal_plan_id`(request body)와 `ws_url`(`NEXT_PUBLIC_WS_URL`+`/ws/meal-plans/{id}/status`), `expires_at`(ISO datetime = now + expires_in_sec)을 조합해 WsTicketResponseSchema 4-필드 형태 구성. 최종 응답도 safeParse로 이중 검증.
- 모든 라우트: createProtectedRoute 래핑(jose RS256 JWT), session.user_id → fetchBff userId(rate-limit + PHI audit), x-request-id/x-forwarded-for 전파, VALIDATION_ERROR 400 + BFF_CONTRACT_VIOLATION 502 명시적 처리.
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass(logout carry-over 경고만) / `scripts/gate-check.sh fe_bff_compliance` `{passed:true}`.
### 미완료: 없음 (IMPL-APP-001b 8 chunks 전부 완료 — 001c 시작).
### 연관 파일: apps/web/src/app/api/meal-plans/[id]/regenerate/, apps/web/src/app/api/ws-ticket/

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001c-1
commit_sha: bde0902
files_changed:
  - apps/web/src/lib/fetcher.ts
  - apps/web/src/lib/query-client.ts
  - apps/web/src/providers.tsx
  - apps/web/package.json
  - pnpm-lock.yaml
verified_by: claude-opus-4-7
---
### 완료: 코어 프로바이더 — TanStack Query + next-intl + toast (IMPL-APP-001c-1)
- `lib/fetcher.ts`: 브라우저 side fetch 래퍼로 same-origin `/api/*` 강제(path prefix assertion) — `credentials: 'same-origin'`, `X-Request-Id` 자동 생성(crypto.randomUUID fallback), 204 no-body 처리, JSON parse 실패 시 `INVALID_JSON` FetcherError. BFF 에러 envelope `{error:{code,message,requestId,details}}` unwrap 하여 `FetcherError(status, code, message, requestId, tokenExpired, details)` throw. 옵션 `schema` 지정 시 응답 Zod safeParse(미통과 → `CLIENT_CONTRACT_VIOLATION` 502). `postJson`/`patchJson` sugar helpers.
- `lib/query-client.ts`: `createQueryClient()` factory — `staleTime: 60_000`, query/mutation retry policy(401+`X-Token-Expired:true` 만 1회 retry → 내부적으로 `/api/auth/refresh` 호출, 4xx non-expired 는 no-retry). `refreshTokens()` 가 동시 다중 401 → 단일 refresh promise 공유(race 방지).
- `providers.tsx`: `'use client'` + `QueryClientProvider` + `NextIntlClientProvider`(locale/messages/timeZone props) + `<Toaster position="top-right" />` 조합. `useState(() => createQueryClient())` 로 서버/클라이언트 boundary 에서 QueryClient 단일 인스턴스 유지(Next.js RSC + streaming 패턴).
- 의존성: `@tanstack/react-query@^5`, `next-intl@^3`, `react-hot-toast@^2` 추가(apps/web dependencies). lockfile 재생성.
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass(logout carry-over 경고만) / `scripts/gate-check.sh fe_bff_compliance` `{passed:true}` / `scripts/gate-check.sh fe_token_hardcode` `{passed:true}`.
### 미완료: 001c-2 (i18n scaffold: en.json + ko.json + layout.tsx wrap), 001c-3 (route groups), 001c-4 (middleware + env + security headers). providers.tsx 는 001c-2 에서 layout.tsx 가 실제로 import 할 때 활성화됨.
### 연관 파일: apps/web/src/lib/, apps/web/src/providers.tsx, apps/web/package.json

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001c-2
commit_sha: bc574c5
files_changed:
  - apps/web/src/i18n/en.json
  - apps/web/src/i18n/ko.json
  - apps/web/src/app/layout.tsx
verified_by: claude-opus-4-7
---
### 완료: i18n 스캐폴드 — en/ko 메시지 + Providers 활성화 (IMPL-APP-001c-2)
- `i18n/en.json` / `i18n/ko.json`: Sprint A 스텁 (~20 keys) — `app.{name,tagline}`, `nav.*`, `auth.{login,signup,errors,logoutSuccess}`, `common.*`. 하드코딩 문자열 Day-1 금지 규칙(`.claude/rules/domain/content.md` i18n 섹션)에 따라 모든 UI 문자열은 이 키셋을 통해 접근. 미들웨어 locale routing 은 D9 per Sprint B 로 지연.
- `app/layout.tsx` 수정: `<Providers locale="en" messages={enMessages} timeZone="UTC">` 로 wrap — ThemeProvider 안쪽, AxeDevInit 과 children 을 감싸는 구조. Sprint A 는 locale = 'en' 고정(DEFAULT_LOCALE/DEFAULT_TIME_ZONE 상수). `resolveJsonModule` 이 이미 tsconfig 에 켜져 있어 JSON import 는 별도 설정 불필요. `lang={DEFAULT_LOCALE}` html 속성도 상수 참조로 일원화.
- next-intl client provider 는 001c-1 `providers.tsx` 에 이미 포함되어 있어, 본 PR 은 데이터 공급만 추가(로직 변경 없음). `NextIntlClientProvider` 가 server message → client context 로 hydrate 하도록 RSC → client component boundary 에서 hydration 경계 일치.
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass(logout carry-over 경고만) / `scripts/gate-check.sh fe_bff_compliance` `{passed:true}` / `scripts/gate-check.sh fe_token_hardcode` `{passed:true}`.
### 미완료: 001c-3 (route groups: marketing/auth/app layouts), 001c-4 (middleware + env.example + security headers). 실제 ko 지원(locale detection + middleware routing)은 Sprint B 범위.
### 연관 파일: apps/web/src/i18n/, apps/web/src/app/layout.tsx

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001c-3
commit_sha: 30340dc
files_changed:
  - apps/web/src/app/(marketing)/layout.tsx
  - apps/web/src/app/(auth)/layout.tsx
  - apps/web/src/app/(app)/layout.tsx
verified_by: claude-opus-4-7
---
### 완료: 라우트 그룹 레이아웃 셸 — marketing / auth / app (IMPL-APP-001c-3)
- `(marketing)/layout.tsx`: 상단 sticky 네비 + 하단 main, 좌측 브랜드(`tApp('name')`) + 우측 nav(home/celebrities/recipes/account). RSC 서버 컴포넌트 + `useTranslations`(next-intl v3 RSC 지원). 모든 색상/보더는 `--cb-color-{bg,fg,border}` 토큰 참조 — raw hex 0건.
- `(auth)/layout.tsx`: viewport center 카드(max-width 400px) — 로그인/가입 폼이 입주할 컨테이너. 카드 boxShadow/radius 는 `--cb-shadow-md` / `--cb-radius-lg` 토큰 fallback 체인(`var(--token, default)`)으로 안전 노출.
- `(app)/layout.tsx`: 좌측 240px sidebar(`grid-template-columns: 240px 1fr`) + 우측 메인. nav: dashboard/plans/account. **인증 게이트는 본 레이아웃에 없음** — D4 per Sprint A 는 `getSessionOrRedirect` 헬퍼를 만들지 않고, 미들웨어(001c-4) 가 cb_access 쿠키 부재 시 `/login?from=...` 로 redirect 한다(edge runtime, jose 검증 없음 — 단순 cookie presence 체크).
- 라우트 그룹 `(name)` 은 URL 에 노출되지 않음(예: `/dashboard` 는 `(app)/dashboard/page.tsx`). 따라서 미들웨어 matcher 는 그룹명이 아닌 pathname prefix(`/dashboard|/plans|/account`) 기반으로 동작해야 함 — 001c-4 에서 `PROTECTED_PATHS` 배열로 구현 예정.
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass(logout carry-over 경고만) / `scripts/gate-check.sh fe_bff_compliance` `{passed:true}` / `scripts/gate-check.sh fe_token_hardcode` `{passed:true}`.
### 미완료: 001c-4 (middleware + .env.example + next.config.ts security headers). 라우트 그룹 내부 page.tsx (login/signup/dashboard 등) 는 Sprint B 범위.
### 연관 파일: apps/web/src/app/(marketing)/, apps/web/src/app/(auth)/, apps/web/src/app/(app)/

---
date: 2026-04-19
agent: claude-opus-4-7
task_id: IMPL-APP-001c-4
commit_sha: 676c302
files_changed:
  - apps/web/middleware.ts
  - apps/web/.env.example
  - apps/web/next.config.ts
verified_by: claude-opus-4-7
---
### 완료: 미들웨어 + .env.example + 보안 헤더 (IMPL-APP-001c-4)
- `middleware.ts`: edge runtime 기본(D17) — `cb_access` 쿠키 presence-only 체크(JWT 검증 X — 그건 route handler 의 `createProtectedRoute` 책임). `PROTECTED_PATHS = ['/dashboard', '/plans', '/account']` prefix 매칭 시 쿠키 부재면 `/login?from=<encoded original>` 로 302 redirect. 모든 요청에 `x-request-id` 채번/전파(없으면 `crypto.randomUUID` 생성, `NextResponse.next({request: {headers}})` 패턴으로 다운스트림 RSC/route handler 가 동일 ID 관찰). matcher 는 `/api`, `_next/static|_next/image`, `favicon.ico`, `slice` 제외 — slice preview 는 dev 도구라 인증 게이트 적용 안 함. Pino/jsonwebtoken 미사용(edge 호환성, D17 준수).
- `.env.example`: Sprint A 환경 변수 템플릿 — Cognito 3종(`COGNITO_JWKS_URL`/`COGNITO_ISSUER`/`COGNITO_AUDIENCE`, D15), BE 3종(`USER_SERVICE_URL`/`CONTENT_SERVICE_URL`/`MEAL_PLAN_URL`), `NEXT_PUBLIC_WS_URL`(D6 — 클라이언트 노출 의도적). `JWT_SECRET` 미포함(D15 가 HS256 path 제거). 각 변수 위에 의도/사용처 주석.
- `next.config.ts`: `headers()` 추가 — `Content-Security-Policy`(env 분기: dev 는 `unsafe-inline 'unsafe-eval'` for Next.js HMR, prod 는 strict; `connect-src 'self' ${NEXT_PUBLIC_WS_URL}` 로 WS 허용), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. **Sprint B TODO 주석**: prod 는 nonce-based strict CSP 로 교체 필요(현재는 dev/prod 모두 동일 정적 정책).
- 검증: `pnpm --filter web typecheck` pass / `pnpm --filter web lint` pass(logout carry-over 경고만) / `scripts/gate-check.sh fe_bff_compliance` `{passed:true}` / `scripts/gate-check.sh fe_token_hardcode` `{passed:true}`.
### 미완료: Sprint A 통합 게이트(fe_bff_smoke 4-probe 실행, fe_slice_smoke 회귀, fe_contract_check 실시간 검증). Sprint B: nonce CSP, RSC silent refresh(Server Action 또는 middleware-based), middleware locale routing, 라우트 그룹 page.tsx.
### 연관 파일: apps/web/middleware.ts, apps/web/.env.example, apps/web/next.config.ts
