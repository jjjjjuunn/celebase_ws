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

## [2026-04-14] Fix: IMPL-011 MEDIUM 이슈 수정 (M1~M5)
### 완료:
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

## [2026-04-14] Feat: IMPL-012 Stripe 구독 + Webhook (Phase B)
### 완료:
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
