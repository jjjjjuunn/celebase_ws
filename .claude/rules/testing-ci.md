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
