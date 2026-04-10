# QA-PLAN: {{TASK_ID}}

> Claude가 작성하는 QA 계획. Codex가 이 계획에 따라 테스트를 작성/실행한다.

## Scope

{{테스트 대상 범위 — 어떤 기능/모듈을 검증하는가}}

## Test Scenarios

### Unit Tests

{{각 시나리오는 입력, 기대 출력, 검증 포인트를 포함한다}}

1. **{{시나리오 이름}}**
   - Input: ...
   - Expected: ...
   - Verify: ...

### Integration Tests

1. **{{시나리오 이름}}**
   - Setup: ...
   - Action: ...
   - Assert: ...

### Edge Cases

1. **{{경계값/예외 시나리오}}**
   - Input: ...
   - Expected: ...

## Commands to Run

```bash
# Unit tests
pnpm turbo run test --filter={{service-name}}

# Integration tests
pnpm turbo run test --filter={{service-name}} -- --testPathPattern=integration

# Contract tests
pytest tests/contract/ -v

# Full suite (regression check)
pnpm turbo run test
pnpm turbo run lint
pnpm turbo run typecheck
```

## Expected Results

- All unit tests pass
- All integration tests pass
- Contract tests pass
- No lint errors
- No typecheck errors
- Coverage >= 80% for new code
