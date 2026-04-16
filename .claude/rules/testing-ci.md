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
  1. feat/fix 커밋 시 로그 엔트리를 포함하되 `commit_sha: PENDING`으로 기재 (validator가 top entry에만 허용)
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
