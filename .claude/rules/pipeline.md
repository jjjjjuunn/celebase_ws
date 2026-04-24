# Claude-Codex Pipeline Rules

> Claude가 파이프라인을 운용할 때 따르는 규칙.

## 언제 파이프라인을 사용하는가

- 3개 이상의 파일 변경이 예상되는 기능 구현 (feat)
- 사용자가 명시적으로 파이프라인을 요청할 때
- 단순 수정(1-2 파일 변경, typo fix)은 Claude 직접 처리

## 파이프라인 호출 방법

```bash
scripts/pipeline.sh <TASK-ID> <step>
```

단계는 반드시 순서대로 실행한다:
1. `init` → 워크트리 생성
2. Claude가 `pipeline/runs/<TASK-ID>/CODEX-HANDOFF.md` 작성 (Step 1)
3. `implement` → Codex 구현
4. `gate-implement` → 자동 체크 + Claude 판정 (Step 3)
5. `review` → Codex 리뷰
6. `gate-review` → 리뷰 게이트 + Claude 판정 (Step 5)
7. Claude가 `pipeline/runs/<TASK-ID>/QA-PLAN.md` 작성 (Step 6)
8. `qa-exec` → Codex QA 실행
9. `gate-qa` → QA 게이트 + Claude 판정 (Step 8)
10. `finalize` → 머지 준비 (Step 9)
11. Claude가 `pipeline/runs/<TASK-ID>/LESSONS.md` 작성 (Step 10)

## LESSONS.md 작성 기준

- `pipeline/templates/LESSONS.template.md`를 기반으로 작성
- **작성 시점**: `finalize` 완료 직후 (Step 10)
- 작성 대상:
  - 이번 구현에서 새로 발견한 패턴/안티패턴
  - fix-request가 1회 이상 발생한 경우 원인과 해결책
  - 다음 CODEX-HANDOFF Anti-Patterns 섹션에 추가할 항목
- **병합**: LESSONS.md 작성 후, `rules 병합 대상` 표의 각 항목을 해당 `.claude/rules/*.md`에 반영한다
- **Obsidian 저장**: LESSONS.md 작성 후 동일 내용을 아래 경로에 복사한다
  - 경로: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/JW_Obsidian_iCloud/1. Projects/PBL/Projects/Celebase_ws/Pipeline Lessons/`
  - 파일명: `Claude-<YYYY-MM-DD>-<TASK-ID>-Lessons.md`
- 내용이 없으면 ("이번엔 새로 발견한 패턴 없음") 빈 LESSONS.md를 작성하고 종료

## CODEX-HANDOFF 작성 기준

- `pipeline/templates/CODEX-HANDOFF.template.md`를 기반으로 작성
- Requirements 섹션: 각 항목은 검증 가능한 단일 동작으로 작성
- Affected Paths: 변경 대상을 명확히 제한 (범위 외 변경 방지)
- Anti-Patterns: 해당 작업에서 특히 주의할 패턴 명시
- spec.md의 관련 섹션 번호를 Reference에 포함

### BE Pydantic 필드명 실제 확인 후 Zod 작성 (IMPL-APP-005-b 교훈)

shared-types의 Zod 스키마를 작성하기 전 **반드시 BE Pydantic 모델 파일을 직접 읽어** 실제 필드명을 확인한다:

```bash
# Python 모델 실제 필드명 확인
grep -n "class Citation\|source_type\|title\|url\|celeb_persona" \
  services/meal-plan-engine/src/engine/llm_schema.py
```

- Plan 문서의 이상적 계약 (`type/source/url`)과 실제 Python `model_dump()` 출력 (`source_type/title/url/celeb_persona`)이 다를 수 있다.
- HANDOFF의 "BE Response Shape" 섹션은 실제 Python 모델 필드명 기준으로 작성한다 — 계획 단계의 이상화된 이름이 아닌 실제 출력 이름.

### DB Schema 인라인 규칙 (C3 교훈)

Repository 또는 SQL 변경이 포함된 HANDOFF는 **대상 테이블 DDL을 인라인**해야 한다:

- `db/migrations/`에서 해당 CREATE TABLE + 이후 ALTER TABLE 전문 복붙
- API 필드 → DB 컬럼 매핑 테이블 포함 (변환이 있는 경우)
- 이유: Codex는 migration 파일을 자동으로 읽지 않아 존재하지 않는 컬럼으로 코드를 생성함 (C3에서 확인)
- `gate-check.sh sql_schema` 자동 체크가 INSERT/UPDATE 컬럼의 DDL 존재 여부를 검증한다

### Package Changes 명시 규칙 (IMPL-010-f 교훈)

신규 npm/pip 패키지를 사용하는 HANDOFF는 **Package Changes 섹션**을 포함해야 한다:

```markdown
## Package Changes
- ADD `uuidv7@^1.0.2` to `services/user-service/package.json` dependencies
```

이유: Codex가 import만 추가하고 `package.json` 업데이트를 잊으면 typecheck에서 `Cannot find module` 실패. IMPL-010-f에서 `uuidv7` 누락으로 확인.

### Codex implement 후 SQL 문자열 확인 (IMPL-016-b1 교훈)

Codex가 Python heredoc으로 TypeScript 파일을 쓸 때 SQL 문자열의 백틱·`$1` 플레이스홀더·따옴표가 zsh 레이어에서 탈출되어 빈 쿼리나 손상된 파일이 생성될 수 있다. implement 후 반드시 확인:

1. repository 파일 내 SQL 문자열이 실제로 채워져 있는지 (빈 문자열 `''` 또는 손상 여부)
2. migration의 CHECK constraint 값에 따옴표가 있는지 — `CHECK (result IN ('applied','skipped','error'))` ✅ / `CHECK (result IN (applied,skipped,error))` ❌

빈 쿼리 또는 따옴표 누락 발견 시 Claude가 직접 `Write`로 수정 후 gate 진행.

### TypeScript 주의 패턴 (IMPL-016-a2 교훈)

HANDOFF Anti-Patterns 섹션에 아래 항목을 반드시 포함한다:

- **`uuidv7` import**: `import { uuidv7 } from "uuidv7"` — `{ v7 as uuidv7 }` 형식은 존재하지 않음
- **template literal number 삽입**: `${String(n)}` 으로 명시적 변환 필요 (`restrict-template-expressions`)
- **`exactOptionalPropertyTypes`**: optional RequestInit 프로퍼티 (body 등) 는 `...(val !== undefined ? { body } : {})` 조건부 spread 사용
- **Node.js tsconfig `RequestInfo` 미존재**: `fetch` 래퍼 파라미터는 `URL` 타입만 사용
- **에러 클래스 `instanceof` — value import 필수**: `import type { ErrClass }` 는 런타임 소거 → `instanceof` 항상 false. `import { ErrClass }` (value) 사용
- **pino `log.warn` 인자 순서**: `log.warn({ data }, 'event')` — object 먼저, string 나중 (console.warn 과 반대)
- **Error 서브클래스 `override` 필수**: `cause`, `name` 등 Error 기반 멤버 재선언 시 `override` 키워드 필수 (`noImplicitOverride` + ES2022 lib)
- **`app.register` 콜백 `async` 제거**: 콜백 내부에 `await` 없으면 `async` 키워드 삭제 (`require-await` lint rule). **HANDOFF 스펙에서도** `await` 없는 Fastify 플러그인은 `function pluginName(...): void` sync 시그니처로 작성 — `async function ... Promise<void>` 로 명시하면 Codex가 그대로 따라 `require-await` lint 에러 발생 (IMPL-016-d1 교훈)
- **`no-confusing-void-expression`**: `setTimeout(() => fn(), ms)` 에서 fn() 이 void 면 블록 형태 `() => { fn(); }` 사용
- **TypeScript string union literal 따옴표 누락 (IMPL-017-c2 교훈)**: `BffTarget` 같은 string union 확장 시 Codex가 따옴표를 빠뜨리는 버그 발생 (`case analytics:` → `case 'analytics':`). implement 후 `tsc --noEmit`으로 즉시 확인.
- **readEnv() 상수 선언 누락 (IMPL-017-c2 교훈)**: switch case에 새 target 추가 시 Codex가 `case 'analytics': return ANALYTICS_SERVICE_URL` 은 추가하면서 `const ANALYTICS_SERVICE_URL = readEnv(...)` 모듈 레벨 선언은 빠뜨리는 경향. 모듈 레벨 상수 존재 여부 확인 필수.

### Fastify module augmentation `import 'fastify'` 선두 필수 (IMPL-016-b2 교훈)

`declare module 'fastify' { interface FastifyRequest { ... } }` 앞에 반드시 `import 'fastify';`를 포함해야 한다. 없으면 ambient module declaration이 되어 Fastify 전체 타입(FastifyReply, FastifyInstance 등)이 소실된다:

```typescript
// ✅ module augmentation
import 'fastify';
declare module 'fastify' {
  interface FastifyRequest { userId: string; }
}

// ❌ ambient module declaration — Fastify 타입 전체 대체
declare module 'fastify' {
  interface FastifyRequest { userId: string; }
}
```

### Stripe SDK v22 switch case — type assertion 불필요 (IMPL-016-b2 교훈)

Stripe SDK v22의 `Stripe.Event` 타입은 `event.type`에 따라 discriminated union으로 이미 좁혀준다. `switch (event.type)` 케이스 내부에서 `as Stripe.Checkout.Session` 등 type assertion은 불필요하며 lint 에러 유발:

```typescript
// ❌ unnecessary assertion
case 'checkout.session.completed':
  await handler(pool, event.data.object as Stripe.Checkout.Session);

// ✅ SDK가 이미 타입을 좁혀줌
case 'checkout.session.completed':
  await handler(pool, event.data.object);
```

### gate-implement 전 git commit 필수 (IMPL-016-b2 교훈)

`pipeline.sh gate-implement`는 `git diff --name-only BASE...HEAD`로 파일 변경을 감지한다. Claude Write 도구로 파일을 생성해도 커밋하지 않으면 untracked 상태(`??`)로 감지 실패 → "No source files changed" gate FAIL 발생:

```bash
# Claude Write로 파일 생성 후 반드시:
git add <new-files>
git commit -m "feat(...): ..."
# 그 후 gate-implement 실행
```

### service-core publicPaths prefix wildcard 지원 (IMPL-016-b3 교훈)

`/internal/*` 처럼 동적 경로를 external JWT 가드에서 제외하려면 `registerJwtAuth` 의 `publicPaths` Set 이 prefix wildcard 를 지원해야 한다. `isPublicPath()` 헬퍼를 `packages/service-core/src/middleware/jwt.ts` 에 추가:

```typescript
// ✅ prefix wildcard: "/internal/*" → "/internal/" 로 시작하는 모든 경로 매칭
function isPublicPath(urlPath: string, publicPaths: ReadonlySet<string>): boolean {
  if (publicPaths.has(urlPath)) return true;
  for (const pattern of publicPaths) {
    if (pattern.endsWith('/*') && urlPath.startsWith(pattern.slice(0, -1))) return true;
  }
  return false;
}
```

서비스 등록 시:
```typescript
// ✅ internal routes 는 prefix wildcard 로 external JWT 에서 제외
registerJwtAuth(app, { publicPaths: ['/internal/*'] });
// ❌ exact match 는 동적 경로에 매칭 불가
registerJwtAuth(app, { publicPaths: ['/internal/users/abc/tier'] });
```

### Fastify onRequest hook 등록 순서 — internal guard 먼저 (IMPL-016-b3 교훈)

Fastify `addHook('onRequest', ...)` 는 등록 순서대로 실행된다. `/internal/*` 경로에서 internal JWT guard 가 먼저 실행되려면 `registerJwtAuth` → `registerInternalJwtAuth` → 라우트 등록 순서를 지켜야 한다:

```typescript
// ✅ 올바른 순서: external JWT (publicPaths에서 /internal/* skip) → internal JWT guard
registerJwtAuth(app, { publicPaths: [..., '/internal/*'] });
registerInternalJwtAuth(app);  // /internal/* 에만 적용
await app.register(internalRoutes, { pool });
```

### pg.PoolClient 에는 `.log` 없음 — logger 파라미터 주입 (IMPL-016-b3 교훈)

`pg.PoolClient` 는 로거를 가지지 않는다. 서비스 함수에서 structured log 를 남기려면 `FastifyBaseLogger` 를 파라미터로 주입해야 한다:

```typescript
// ❌ pg.PoolClient 에는 log 프로퍼티 없음
client.log?.info('tier updated');

// ✅ FastifyBaseLogger 파라미터로 주입
export async function updateTier(
  pool: pg.Pool,
  userId: string,
  tier: SubscriptionTier,
  idempotencyKey: string,
  log: FastifyBaseLogger,
): Promise<UpdateTierResult>
```

### 삭제 + 대체 파일 패턴 시 대체 코드 테스트 필수 (IMPL-016-d1 교훈)

파일을 삭제하고 대체 파일을 작성하는 패턴에서:

1. **삭제 파일의 기존 테스트도 함께 삭제**한다 (stale import 로 인한 "Cannot find module" 실패 방지).
2. **대체 파일에 대한 새 테스트를 반드시 작성**한다 (Codex review 가 "Missing tests" HIGH 로 리포트하는 원인).
3. **HANDOFF Acceptance Criteria에 신규 함수/라우트 테스트 통과 조건을 명시**한다.

```markdown
## Acceptance Criteria
- [ ] `findTierByUserId` 단위 테스트 통과 (3 tests)
- [ ] `GET /subscriptions/me` 통합 테스트 통과 (2 tests)
- [ ] `POST /subscriptions`, `POST /webhooks/stripe` 라우트 부재 확인 테스트 통과 (3 tests)
```

이유: 대체 파일만 작성하고 테스트를 추가하지 않으면 Codex review 에서 HIGH "Missing unit/integration tests" finding 이 발생하여 gate-review 재실행이 필요해진다.

### CODEX-HANDOFF 크기 제한 (필수)

**한 HANDOFF에서 생성/수정하는 파일은 최대 5개**로 제한한다.

- 파일 수가 5개를 초과하면 작업을 하위 태스크(TASK-ID-a, TASK-ID-b)로 분리한다
- Python 서비스는 heredoc 오버헤드로 토큰 소비가 크므로 **4개 이하** 권장
- 판단 기준: 신규 파일 × 1.5 + 수정 파일 × 1.0 ≤ 5

이유: Codex `exec`는 단일 API completion이며 o3 기준 ~230K 토큰에서 중단된다. 8파일 HANDOFF는 반복적으로 부분 완성 후 종료됨 (IMPL-003, IMPL-004-b, IMPL-004-c에서 확인).

### Claude-Codex 하이브리드 분업 (IMPL-004-c 교훈)

모든 작업을 Codex에 위임하지 않는다. 역할별 최적 에이전트:

| 작업 유형 | 담당 | 이유 |
|-----------|------|------|
| 알고리즘/도메인 로직 | **Codex** | 설계 판단이 필요한 코드에서 강점 |
| CRUD/보일러플레이트 | **Claude 직접** | 패턴이 명확하고 Codex 토큰 낭비 |
| 독립 코드 리뷰 | **Codex** | Claude와 다른 시각의 리뷰가 핵심 가치 |
| QA 테스트 실행 | **Codex** | 격리 환경에서 실행 + 검증 |
| 아키텍처 설계 | **Claude** | 컨텍스트 윈도우 + 멀티턴 대화 강점 |

Codex `implement` 후 미완성 파일이 있으면 Claude가 직접 보충 → gate-implement에서 통합 검증.

## 게이트 판정 원칙

### 자동 체크 (scripts/gate-check.sh)
- 하나라도 fail이면 전체 fail → 수정 요청

### Claude 판정 (자동 체크 통과 후)
- **엄격**: 보안 규칙 위반, PHI 처리 오류, 서비스 경계 위반
- **보통**: 아키텍처 일관성, 테스트 충분성
- **관대**: 코드 스타일 (lint 통과했으면 OK)
- `pipeline/templates/gate-criteria.yaml`의 판정 항목을 순회한다

### Codex review 스코프 분리 판정 (IMPL-016-c1 교훈)

Codex `review` 는 `origin/main...HEAD` 전체를 스캔한다. IMPL-016 처럼 여러 sub-task 가 순차적으로 쌓인 브랜치에서는 이전 HANDOFF 코드 (b1/b2/b3) 의 문제가 현재 HANDOFF (c1) 의 CRITICAL 로 리포트될 수 있다.

gate-review Claude 판정 시:
1. 각 finding 이 현재 HANDOFF 의 **스코프 파일 목록** 에 속하는지 확인
2. 스코프 외 파일 → "out-of-scope — 해당 HANDOFF 에서 처리됨" 으로 PASS 근거 기록
3. "테스트 없음" 은 테스트 파일이 다음 sub-task 로 명시 위임된 경우 "by plan design" 으로 PASS
4. 판정 근거를 `pipeline-log.jsonl` 에 상세 기록

### 판정 결과 기록
- Pass: `log_event`로 기록, 다음 단계 진행
- Fail: `pipeline/runs/<TASK-ID>/fix-request-N.md` 작성 후 `fix` 단계 호출

## 수정 루프 (Fix Cycle)

- 최대 3회 (PGE 규칙 #14)
- 각 fix-request는 `pipeline/templates/fix-request.template.md` 기반
- 실패 항목만 수정 요청 (범위 외 "개선" 요청 금지)
- 3회 초과 시: `ESCALATE_TO_HUMAN` + `IMPLEMENTATION_LOG.md`에 에스컬레이션 기록

## 에스컬레이션 기록 형식

```markdown
## ESCALATION: [TASK-ID]
- 시도 횟수: 3/3
- 게이트: [implement | review | qa]
- 마지막 실패 사유: [구체적 이유]
- 시도한 접근법: [각 시도 1줄 요약]
- 권장 다음 단계: [사람이 해야 할 것]
```

## Codex 모델 선택

- 기본: `o3` (비용 효율적)
- 복잡한 로직: `--model o3` 유지
- 단순 작업: `--model o4-mini` 가능

## 워크트리 관리

- 생성: `pipeline.sh <TASK-ID> init`
- 위치: `.worktrees/<TASK-ID>/`
- 정리: 파이프라인 완료 후 `git worktree remove` (수동)
- `.worktrees/`는 `.gitignore`에 등록

### 워크트리 내 workspace 패키지 빌드 선행 (IMPL-003 교훈)

git worktree는 `packages/*/dist/`를 포함하지 않아 typecheck/test 실행 전 빌드가 필요하다:

```bash
pnpm --filter shared-types build
pnpm --filter service-core build
```

gate-implement 자동 체크 전 이 단계가 빠지면 `Cannot find module '@celebbase/shared-types'` 오류 발생.

### CODEX-INSTRUCTIONS.md 주입 방법 (IMPL-004-b 교훈)

`codex exec -c model_instructions_file=...` 는 유효하지 않은 config 키 — 무시된다.
올바른 주입: `run_codex()`에서 mktemp 파일에 CODEX-INSTRUCTIONS.md + task 내용을 합쳐 stdin으로 전달.
`AGENTS.md`를 프로젝트 루트에 유지하면 Codex가 자동 로드한다.

### Terraform 스테이징 전용 리소스 환경 격리 (CHORE-006 교훈)

`count = var.enable ? 1 : 0` 단독으로는 tfvars 실수 시 prod에 스테이징 전용 리소스가 배포될 수 있다. `lifecycle.precondition`으로 Terraform plan 단계에서 이중 차단:

```hcl
lifecycle {
  precondition {
    condition     = var.environment != "prod"
    error_message = "이 리소스는 prod 환경에 배포할 수 없습니다."
  }
}
```

스테이징 전용 리소스(smoke client, debug endpoint 등)는 `count` gate + `lifecycle.precondition` 두 가지 모두 적용한다.

### QA 단계 Python venv 사전 설치 (IMPL-004-c 교훈)

Codex sandbox에는 PyPI 접근이 없어 pytest 실행이 실패한다. 이를 방지하기 위해 `pipeline.sh`의 `step_qa_exec()`에서 Codex 실행 **전에** Python venv을 생성하고 의존성을 설치한다:

```bash
python3 -m venv services/meal-plan-engine/.venv
.venv/bin/pip install -r requirements.txt
```

Codex QA 프롬프트에 `.venv/bin/python -m pytest` 경로를 명시한다. 그래도 가짜 `pytest/` 디렉토리가 생성되면 `gate-check.sh`의 `check_fake_stubs()`가 자동 탐지하여 gate FAIL 처리한다.

gate-qa 판정 시 Claude가 직접 `python3 -m pytest`를 실행해 실제 통과 여부를 이중 확인한다.

### qa-exec 후 fake node_modules 탐지 필수 (IMPL-APP-005-b 교훈)

Codex sandbox에 node_modules가 없을 때 `node_modules/.bin/tsc` 등 fake binary를 생성해 QA를 통과시키는 경우가 있다. `check_fake_stubs()`는 이를 감지하지 못할 수 있으므로 Claude가 직접 확인해야 한다:

```bash
# qa-exec 후 worktree에 node_modules가 생겼다면 크기 확인
ls -la .worktrees/<TASK-ID>/node_modules/.bin/ 2>/dev/null
# 실제 tsc: ~1.5KB, fake stub: ~84B
```

fake 탐지 시:
1. `.worktrees/<TASK-ID>/node_modules/` 전체 삭제
2. 실제 workspace tsc로 재검증: `node_modules/.bin/tsc -p packages/shared-types/tsconfig.json --noEmit`

또한 Codex qa-exec이 구현 파일을 "개선"한다는 명목으로 수정하는 경우 `git diff HEAD` 로 확인 후 불필요한 변경은 `git checkout <file>` 로 revert한다.

### 신규 서비스 포트 할당 전 compose 상태 확인 (IMPL-016-c3 교훈)

신규 서비스의 포트를 plan 에 명시하기 전, 반드시 `docker-compose.yml` 의 실제 포트 매핑을 확인한다:

```bash
grep -A1 'ports:' docker-compose.yml
```

plan 작성 시점의 포트 번호가 이후 compose 에 추가된 다른 서비스와 충돌할 수 있다. IMPL-016 plan 은 commerce-service 를 3002 로 명시했으나 content-service 가 이미 3002:3002 를 점유하고 있어 3004 로 재할당했다.

## Adaptive Review Intensity Policy

> 작업마다 리뷰 횟수를 고정하지 않는다. 복잡도 등급(L1~L4)을 먼저 산정하고, 매핑된 횟수만큼만 Codex/Gemini 리뷰를 실행한다.

### Complexity Tiers

| 등급 | 판별 신호 | 리뷰 강도 |
|------|-----------|-----------|
| **L1 · chore** | 설정·린트·CI 스크립트, 파일 1~3개, 기존 패턴 복붙 | **0회** (CI 자동화만) |
| **L2 · feat** | 단일 서비스 내 기능 추가, DB 스키마 변경 없음 | **Codex 1회** |
| **L3 · 보안/데이터 민감** | 인증·토큰·PHI·감사로그·DB 스키마 변경 포함 | **Codex 2회 + Gemini 1회 (adversarial)** |
| **L4 · 아키텍처** | 신규 서비스 분리, 서비스 경계 재설계, 외부 결제/API 연동 | **Codex 3회 + Gemini 2회 (arch review)** |

### Signal 가산 규칙

- 보안 규칙 (CLAUDE.md Absolute Rules 1~10 또는 spec §6) 건드림 → **+1 tier**
- PHI / 결제 / 인증 데이터 형상 변함 → **+1 tier**
- 여러 서비스 동시 수정 → **+1 tier**
- 단일 파일 + 기존 테스트로 충분히 검증 가능 → **−1 tier**

### 판정 절차

1. 작업 시작 시 tier 산정 → `pipeline-log.jsonl` 에 `review_tier: L{n}` 기록
2. tier 에 매핑된 횟수만큼 Codex/Gemini 리뷰 실행
3. 리뷰 수가 rubric 미만이면 gate Claude 판정 시 FAIL

### Pending 백엔드 태스크 매핑 (참조용)

| Task | 등급 | 리뷰 |
|------|------|------|
| CHORE-003 (CI checks) | L1 | 0 |
| CHORE-004 (lint debt) | L1 | 0 |
| CHORE-005 (LocalStack E2E) | L2 | Codex 1 |
| IMPL-010-f (jti blacklist) | L3 | Codex 2 + Gemini 1 |
| CHORE-006 (Cognito flip) | L3 | Codex 2 + Gemini 1 |
| IMPL-016 (commerce-service) | L4 | Codex 3 + Gemini 2 |
| IMPL-017 (analytics-service) | L4 | Codex 3 + Gemini 2 |

---

## FE 파이프라인 규칙 (IMPL-UI-*)

> 본 섹션은 프론트엔드 (Next.js `apps/web`, `packages/ui-kit`, `packages/design-tokens`) 작업에만 적용한다.
> BE (Python 서비스·migration·PHI) 규칙은 위 섹션들을 유지한다 — 두 규칙 세트는 독립이다.

### 템플릿 분리

- **FE 전용 HANDOFF**: `pipeline/templates/FE-CODEX-HANDOFF.template.md`
- **BE HANDOFF**: `pipeline/templates/CODEX-HANDOFF.template.md` (기존 파일, 수정 금지)
- 한 TASK-ID 는 둘 중 하나만 사용한다. 혼용 금지.

### FE Task ID 규칙

- `IMPL-UI-###` 또는 `IMPL-UI-###-<slug>` 형식
- Affected Paths 는 `apps/*/src/**`, `packages/ui-kit/src/**`, `packages/design-tokens/**` 로만 제한
- BE 경로 (`services/*`, `db/migrations/*`) 를 건드려야 하면 태스크를 분할한다

### Claude / Codex 하이브리드 분업 (FE 특화)

| 작업 유형 | 담당 | 이유 |
|-----------|------|------|
| design-tokens 파이프라인 (build 스크립트·원천 CSS·타입 정의) | **Claude** | 토큰 구조 결정은 DESIGN.md 해석 필요 |
| ui-kit 컴포넌트 구현 (variant·state·a11y) | **Codex** | 반복 JSX 패턴 양산에 강점 |
| `/slice/*` preview 페이지 | **Codex** | 기존 레이아웃 shell 재사용 |
| a11y·axe 리뷰 | **Codex** | 독립 시각 검증 |
| 토큰 네이밍·스케일 결정 | **Claude** | DESIGN.md §2·§3 해석 |
| 브랜드 accent 선택·금지 목록 | **Claude** | DESIGN.md §13.4 Anti-Patterns 관리 |
| **app page 컴포넌트 TSX** (JSX 복잡도 높음) | **Claude 기본, Codex fallback** | JSX `{}` + template literal 복잡도로 Python heredoc 실패 빈번 (IMPL-APP-005-c 교훈) |

### Raw Hex 금지 (자동 검증)

- `apps/*/src/**`, `packages/ui-kit/src/**` 내 `.ts/.tsx/.css/.scss` 에서 raw hex (`#[0-9a-fA-F]{3,8}`) 사용 금지
- 화이트리스트: `packages/design-tokens/*.css`, `packages/design-tokens/*.ts` (토큰 정의 원본)
- 자동 검증: `scripts/gate-check.sh fe_token_hardcode`
- 신규 색 필요 시 **먼저** `packages/design-tokens/tokens.css` 확장 → 컴포넌트에서 `--cb-*` 토큰으로 참조

### FE DoD 필수 근거 (gate-implement 판정 기준)

- `pnpm --filter web typecheck` 로그
- `pnpm --filter web lint` 로그
- `scripts/gate-check.sh fe_token_hardcode` JSON (`passed:true`)
- `scripts/gate-check.sh fe_slice_smoke` JSON (`passed:true`, `/slice` 200 기록 포함)
- (선택) `FE_AXE=1 scripts/gate-check.sh fe_axe` — Playwright MCP 환경에서만 실행, serious/critical 0

### FE Gate 체크 구성

| 체크 | 기본 `all` 포함 | 언제 수동 실행 |
|------|----------------|---------------|
| `fe_token_hardcode` | ✅ 포함 | 항상 실행 |
| `fe_axe` | ✅ 포함 (FE_AXE=1 일 때만 실제 검증) | UI 변경 PR 직전 |
| `fe_slice_smoke` | ❌ 제외 (dev server 기동 필요) | gate-implement / gate-qa 단계에서 명시 호출 |

### HANDOFF 크기 제한 (FE 특화)

- 파일 수 판단식: 신규 × 1.5 + 수정 × 1.0 ≤ 5
- TSX 컴포넌트 위주면 **4 이하** 권장 (JSX + type + CSS module 분산으로 토큰 소비 큼)
- design-tokens 스크립트는 Claude 직접 구현이므로 이 제한에서 제외

### 회귀 방지

- `/slice` 는 모든 FE 태스크 완료 후 200 을 유지한다 (layout.tsx 삭제 금지)
- 기존 preview route 들은 FE 태스크 완료 전후로 curl 200 이 동일해야 한다
- DESIGN.md §2 토큰 정의와 `packages/design-tokens/tokens.css` 값 은 grep 상호 확인으로 정합성 유지

### CSS Modules 빌드 배포 (IMPL-UI-002 교훈)

- ui-kit 같은 tsc-only workspace 패키지는 `.module.css` 를 dist 에 자동 복사하지 않는다 → `packages/ui-kit/scripts/copy-css.mjs` 로 `src/**/*.module.css` → `dist/**/*.module.css` 재귀 복사 필요
- `package.json` `scripts.build` 체인: `"tsc -p tsconfig.json && node scripts/copy-css.mjs"`
- `tsc` 가 `.css` import 를 인식하도록 `src/types/css-modules.d.ts` 에 ambient 선언: `declare module '*.module.css' { const classes: Readonly<Record<string, string>>; export default classes; }`
- Next.js 소비자는 `next.config.*` 에 `transpilePackages: ['@celebbase/ui-kit', '@celebbase/design-tokens']` 필수

### Next.js dev 서버 chunk cache 리셋 (IMPL-UI-002 교훈)

workspace 패키지 (`packages/ui-kit` 등) 를 재빌드하면 webpack chunk manifest 가 이전 chunk ID 를 계속 참조하여 `/slice/*` 가 `Cannot find module './xxx.js'` 로 500 을 반환할 수 있다. 재시작만으로는 부족:

```bash
kill <dev-pid>
rm -rf apps/web/.next/cache apps/web/.next/server
pnpm --filter web dev
```

QA 중 500 이 뜨면 코드 버그 추적 전에 이 순서를 먼저 수행한다.

### pipeline.sh 실행 위치 (IMPL-UI-002 교훈)

`pipeline.sh` 모든 명령은 **repo 루트** 에서 실행한다. worktree 내부에서 실행하면 `WORKTREE_DIR` 이 `$PWD/.worktrees/<TASK-ID>` 로 중첩 해석되어 `step_finalize` 가 실패한다.

### `'use client';` 선언 강제 (IMPL-UI-003 교훈)

React hook (`useState` / `useRef` / `useEffect` / `useCallback` / `useMemo` / 이벤트 핸들러 prop 등) 을 사용하는 ui-kit 컴포넌트 또는 `/slice/*` page 는 **파일 최상단에 `'use client';` 선언 필수**. Next.js App Router 에서 누락 시 `You're importing a component that needs useState...` 빌드 실패 발생.

- FE HANDOFF (component · slice page 둘 다) 의 DoD 체크박스 에 `grep -c "^'use client';" <path> === 1` 명시.
- gate-implement 빌드 단계에서 빠르게 감지되도록 Anti-Pattern 섹션에도 중복 기재.
- IMPL-UI-003-G3 SegmentedControl 에서 누락 → `fix(ui-kit): IMPL-UI-003-G3 — add 'use client'` 커밋 (`1f448d8`) 으로 수정. 이후 HANDOFF 는 선제 반영.

### ui-kit composite test coverage 판정 기준 (IMPL-UI-002 / IMPL-UI-003 precedent)

Codex review 가 "신규 React 컴포넌트에 unit/integration 테스트 없음" 을 MEDIUM/HIGH 로 리포트하는 경우, **기본적으로 out-of-scope 로 pass 판정**한다. 근거:

- ui-kit composite 의 검증 레이어는 Storybook stories + `/slice/*` smoke + (optional) axe 로 정의됨.
- spec.md / DoD 에 ui-kit 단위 unit-test 의무가 매핑되어 있지 않음.
- `.claude/rules/pipeline.md` 게이트 판정 원칙: "DoD 매핑 없는 finding → out-of-scope".

Claude 판정 시 pipeline-log.jsonl 에 "IMPL-UI-002 precedent" 인용으로 일관된 사유를 남긴다. 향후 review-prompt 에 "ui-kit test coverage is satisfied by Storybook + slice smoke" 를 명시하여 Codex 리포트 자체에서 제외하는 방향도 검토.

### 후속 chore 플래그

- `scripts/gate-check.sh check_policy` 가 자기 자신을 DENY 패턴으로 self-match → scan 에서 `scripts/gate-check.sh` 제외 필요 (main HEAD 에서도 동일 실패, IMPL-UI-002 범위 밖)
- `packages/design-tokens/scripts/*.ts` 가 ESLint project-service 범위 밖 → `tsconfig.scripts.json` 분리 or eslint override 필요 (IMPL-UI-001/P2 에서 누적, IMPL-UI-002·IMPL-UI-003 범위 밖)

### CSP dev 모드 `unsafe-eval` 필수 (2026-04-20 교훈)

`middleware.ts`의 `buildCsp`에서 nonce 기반 `script-src`를 사용할 때, **`NODE_ENV !== 'production'`이면 반드시 `'unsafe-eval'`을 추가**해야 한다.

- Next.js webpack HMR과 React Fast Refresh는 개발 모드에서 `eval()`을 사용한다.
- `unsafe-eval` 없이 nonce만 설정하면 JavaScript 번들 자체가 실행되지 않아 React 하이드레이션이 완전히 실패한다.
- `connect-src`에도 `NEXT_PUBLIC_WS_URL` 환경변수(WebSocket URL)를 포함해야 한다.

```typescript
// middleware.ts buildCsp — 올바른 패턴
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = isDev
  ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
  : `script-src 'self' 'nonce-${nonce}'`;
```

**증상**: 로그인 폼 클릭 시 Network 탭에 API 요청이 전혀 없고, URL이 `/login?`으로 변경됨 (React 미하이드레이션으로 네이티브 GET 폼 제출 발생). Console에 `EvalError: Evaluating a string as JavaScript violates CSP` 출력.

**진단 순서**: 폼이 API 호출 없이 GET 방식으로 제출될 때 → Console 탭에서 CSP/JS 에러를 먼저 확인 → Network 로직 디버깅보다 앞선다.

### JWT issuer 정렬 (2026-04-20 교훈)

`.env.local`의 `INTERNAL_JWT_ISSUER`는 `docker-compose.yml`의 user-service 환경변수와 반드시 동일해야 한다. 불일치 시:

- 로그인 POST는 200 성공 (BFF public route, JWT 검증 안 함)
- 이후 protected API 호출 시 401 → fetcher가 자동으로 `/login?reason=session_expired`로 리다이렉트
- 겉으로는 "로그인이 안 된다"처럼 보여 원인 파악이 어렵다.

변경 전 항상 `docker-compose.yml`의 `INTERNAL_JWT_ISSUER` 값을 먼저 확인한다.
