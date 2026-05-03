---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/*_test.py"
  - ".github/**/*"
  - ".husky/**/*"
---
# Testing, CI/CD & Git Rules

## Test Strategy

| Type | Minimum | Focus |
|------|---------|-------|
| Unit | 80% | Business logic, utilities, AI algorithms |
| Integration | 핵심 플로우 | API endpoints, DB queries, external API mocks |
| E2E | Critical paths | Onboarding → Plan Generation → Cart Creation |

## Test Rules

- **테스트 없는 PR은 머지 금지.**
- AI Engine 알고리즘: edge case 포함 unit test 필수.
- 외부 API (Instacart, Stripe, Cognito): mock/stub 필수.
- Snapshot test: UI 컴포넌트만. 비즈니스 로직에는 사용 금지.
- 테스트 데이터: factory 패턴 (하드코딩 fixture 최소화).

### ts-jest ESM 모킹 (IMPL-010-e 교훈)

ts-jest ESM 모드는 모듈 namespace를 frozen으로 만들어 `jest.spyOn(module, 'fn')`이 `Cannot assign to read only property` 에러를 던진다. 반드시 `jest.unstable_mockModule` + `await import(...)` 패턴을 사용한다.

```ts
// ❌ ESM 모드에서 동작 안 함
import * as authService from '../../src/services/auth.service.js';
jest.spyOn(authService, 'signup').mockResolvedValue(...);

// ✅ 올바른 패턴
jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
  signup: jest.fn(),
  // ... 모듈 전체 명시
}));
const { authRoutes } = await import('../../src/routes/auth.routes.js');
```

### ESM mock singleton — jest.fn() 팩토리 외부 선언 (CHORE-006 교훈)

`jest.unstable_mockModule` 팩토리 안에서 `jest.fn()`을 호출하면 팩토리가 호출될 때마다 새 함수 인스턴스가 생성된다. 서비스 모듈이 캐시에 로드되는 시점(라우트 import 시)과 테스트가 import하는 시점에 서로 다른 인스턴스를 받아 `mockFn.mockResolvedValueOnce(...)` 설정이 서비스에 전혀 전달되지 않는다.

```ts
// ❌ 팩토리 내부에서 jest.fn() 생성 — 인스턴스 불일치
jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({
  findByCognitoSub: jest.fn(),  // 매 호출마다 새 인스턴스
}));

// ✅ 팩토리 외부에서 상수로 선언 후 참조
const mockFindByCognitoSub = jest.fn();
jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({
  findByCognitoSub: mockFindByCognitoSub,  // 동일 인스턴스 공유
}));
```

### ESM 트랜지티브 의존 — static import 금지 (CHORE-006 교훈)

테스트 파일 최상단에서 `import { fn } from 'moduleA'` 형태로 static import하면, `jest.unstable_mockModule`이 등록되기 전에 해당 모듈이 로드된다. moduleA가 mock된 repository에 의존한다면, 실제 repository 함수가 이미 바인딩된 상태로 캐시에 올라가 mock이 무효화된다.

해결: 트랜지티브 의존이 있는 함수는 테스트 클래스/함수 내부에서 `await import(...)` 동적 임포트로 가져온다.

```ts
// ❌ 파일 최상단 static import — mock 등록 전에 auth.service가 로드됨
import { issueInternalTokens } from '../../src/services/auth.service.js';

// ✅ 동적 임포트 — mock 등록 후 import, 올바른 mock 인스턴스를 사용
async function issueTokens(client, subject) {
  const { issueInternalTokens } = await import('../../src/services/auth.service.js');
  return issueInternalTokens(client, subject);
}
```

### Fastify 통합 테스트 로거 (IMPL-010-e 교훈)

Fastify 5는 request마다 child 로거를 생성하므로 `app.log.info`를 monkey-patch해도 전파되지 않는다. `loggerInstance`에 동기 객체를 넘기고 `child: () => logger`로 자기 자신을 반환한다. **pino 사용 금지** — pino의 async destination이 Jest 환경 해제 후 `"import after environment teardown"` 에러를 유발한다.

```ts
function makeCaptureLogger(captured: unknown[]): any {
  const logger = {
    level: 'info',
    info: (obj: unknown) => { if (obj !== null && typeof obj === 'object') captured.push(obj); },
    error: () => undefined, warn: () => undefined, debug: () => undefined,
    trace: () => undefined, fatal: () => undefined, silent: () => undefined,
    child: () => logger,
  };
  return logger;
}
const app = Fastify({ loggerInstance: makeCaptureLogger(captured), disableRequestLogging: true });
// disableRequestLogging: true — 기본값(false)이면 req.body(토큰 포함)가 로그에 찍혀 Rule #8 위반
```

### @fastify/rate-limit v10 bypass (IMPL-010-e 교훈)

v10부터 `skip` 필드가 없어졌다 (silently ignored). 테스트 환경 bypass는 `allowList` 콜백으로 구현한다.

```ts
// ❌ v10에서 silently ignored
{ max: 3, timeWindow: '1 minute', skip: () => process.env['NODE_ENV'] === 'test' }

// ✅ 올바른 패턴
{ max: 3, timeWindow: '1 minute', allowList: (_req, _key) => process.env['NODE_ENV'] === 'test' }
```

### ESM 모드 `jest` 전역 미선언 — import 필수 (IMPL-016-c2 교훈)

ts-jest ESM 모드는 Jest 전역(`jest.fn`, `jest.spyOn`, `jest.mock` 등)을 자동 주입하지 않는다. **모든 테스트 파일 최상단에 반드시 `import { jest } from '@jest/globals';` 선언 필수**:

```typescript
// ❌ ESM 모드에서 jest is not defined
jest.spyOn(globalThis, 'fetch');

// ✅ 명시적 import 필수
import { jest } from '@jest/globals';
jest.spyOn(globalThis, 'fetch');
```

`jest.mock()` at module level 도 ESM 에서 동작하지 않는다 (모듈 로드 순서 보장 불가). 해결책: dependency injection 패턴 (mock 객체를 테스트에서 함수에 직접 주입) 또는 `jest.unstable_mockModule`.

### CJS 모드 jest 전역 — `@jest/globals` import 금지 (IMPL-017-c2 교훈)

`jest.config.cjs`에 `useESM: false`인 CJS 모드에서는 `@types/jest`가 jest 전역을 **자동 주입**한다. `import { jest } from '@jest/globals'`를 추가하면 `Cannot find module '@jest/globals'` 빌드 실패 발생:

```typescript
// ❌ CJS 모드에서는 @jest/globals 불필요 — import 추가하면 실패
import { jest } from '@jest/globals';

// ✅ CJS 모드 (useESM: false): jest 전역 그대로 사용
let fetchSpy: jest.SpyInstance;
fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(...);
```

판단 기준: `jest.config.cjs`의 `useESM` 값 확인. `useESM: true` → `@jest/globals` import 필수. `useESM: false` → import 금지.

### 외부 API 어댑터 커버리지 — unit test 필수 (IMPL-016-c2 교훈)

integration test 에서 어댑터를 inline mock 객체 (`{ createCart: jest.fn() }`) 로 교체하면 실제 어댑터 클래스 코드가 전혀 실행되지 않아 coverage 임계값 실패가 발생한다. 반드시 별도 unit test (`tests/unit/adapter.unit.test.ts`) 를 작성해 `fetch` mock 으로 어댑터를 직접 테스트한다:

```typescript
// tests/unit/instacart-adapter.unit.test.ts
import { jest } from '@jest/globals';
const fetchSpy = jest.spyOn(globalThis, 'fetch');
fetchSpy.mockResolvedValue(new Response(JSON.stringify({ cart_id: '...' }), { status: 200 }));
const adapter = new InstacartAdapter({ apiKey: '...', baseUrl: '...' });
const result = await adapter.createCart(items);
expect(result.cartId).toBe('...');
```

## Test File Location

```
services/user-service/
  src/services/user.service.ts
  tests/
    unit/user.service.test.ts
    integration/user.routes.test.ts
```

## Git Workflow

```
main              <- production (보호, direct push 금지)
  └── develop     <- integration branch
       ├── feat/TICKET-123-description
       ├── fix/TICKET-456-description
       └── chore/TICKET-789-description
```

**Commit format**: `<type>(<scope>): <subject>`
- type: `feat | fix | refactor | test | chore | docs | perf`
- scope: `user-svc | content-svc | ai-engine | mobile | web | infra | shared`
- subject: 명령형 현재 시제, 50자 이내

## PR Requirements

- 제목에 ticket 번호
- 변경사항 요약 (what & why)
- 테스트 실행 결과
- 스크린샷 (UI 변경 시)
- 1인 이상 리뷰 승인 후 머지
- Squash merge (develop → main은 merge commit)

## Pre-commit Hooks

```jsonc
// lint-staged.config.js
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{py}": ["ruff check --fix", "ruff format"]
}
```

**`--no-verify` 금지.** 전체 테스트 미통과 시 머지 차단 (CI).

## PGE Harness Loop Control

- Generator → Evaluator 피드백 루프 **최대 3회**.
- 3회 초과 시 `ESCALATE_TO_HUMAN` + 작업 중단.
- 동일 접근 반복 감지 시 즉시 에스컬레이션.
- 단일 Generator 태스크 **15분** 타임아웃.
- 에스컬레이션 시 `IMPLEMENTATION_LOG.md`에 기록:
  ```markdown
  ## ESCALATION: [태스크명]
  - 시도 횟수: 3/3
  - 마지막 실패 사유: [reject 이유]
  - 시도한 접근법: [각 시도 1줄]
  - 권장 다음 단계: [사람 개입 필요 부분]
  ```

## Implementation Log

- 기능 완료 시 `docs/IMPLEMENTATION_LOG.md`에 기록 (append-only).
- **포맷은 `docs/IMPLEMENTATION_LOG.md` 상단 주석의 YAML front-matter 스키마를 따른다.** 헤딩 전용 스타일(`## [날짜] Feature:`)은 사용하지 않는다.
- 필수 필드: `date`, `agent`, `task_id`, `commit_sha`, `verified_by`. `scripts/validate_impl_log.py`가 강제한다.
- 본문은 `### 완료`, `### 미완료`, `### 연관 파일` 세 섹션으로 구성한다.
- 복붙 템플릿: `pipeline/templates/IMPL-LOG-ENTRY.template.md`
- **commit_sha 수급 절차 (2-commit 패턴)**:
  1. feat/fix 커밋 시 로그 엔트리를 포함하되 `commit_sha: PENDING`으로 기재. 파일 **맨 아래(bottom)**에 추가해야 함 — validator는 `last_idx = len(blocks)` 기준으로 마지막 엔트리에만 PENDING을 허용한다. 상단 주석 위치를 따르면 validator 실패.
  2. 해당 커밋 직후 `scripts/record-log-sha.sh`로 실제 SHA 치환 → `docs(log): record <TASK-ID> commit SHA` 별도 커밋
- 새 세션 시작 시 반드시 먼저 읽는다.
- 커밋 전 `scripts/validate_impl_log.py`가 pre-commit hook으로 실행된다 (`scripts/install-hooks.sh`로 1회 설치).

## Definition of Done (Evaluator 승인 기준)

### Functional Criteria
- [ ] 요구된 기능이 spec.md의 명세대로 동작
- [ ] TypeScript strict mode 컴파일 에러 0
- [ ] ESLint / ruff 경고 0

### Verification Steps
- [ ] 새 코드에 대한 테스트 작성 + 전체 통과
- [ ] Semgrep 보안 스캔 통과 (critical 0, high 0)
- [ ] pre-commit hook 통과 (`--no-verify` 흔적 없음)
- [ ] API 변경 시 OpenAPI spec 업데이트
- [ ] DB 스키마 변경 시 migration 포함
- [ ] JSONB 변경 시 `shared-types` 타입 업데이트
- [ ] PHI 접근 코드 변경 시 `phi_access_logs` 기록 확인
- [ ] 외부 URL을 사용자 입력에서 받는 패턴 0건
- [ ] PGE 루프 3회 이내 (초과 시 에스컬레이션 기록)
- [ ] `docs/IMPLEMENTATION_LOG.md` 업데이트

### Provenance & Attestation
- [ ] 관련 커밋에 에이전트/계약 메타데이터 포함
- [ ] 최종 사람 리뷰어가 DoD 체크리스트 승인
