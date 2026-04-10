# FIX-REQUEST: {{TASK_ID}} — Iteration {{N}}/3

> 게이트 판정에서 실패한 항목을 수정해야 한다.

## Gate

**Type**: {{implement | review | qa}}
**Status**: FAIL
**Iteration**: {{N}}/3

## Failed Checks

{{자동 체크 실패 항목}}

### Deterministic Failures

| Check | Exit Code | Detail |
|-------|-----------|--------|
| {{check_name}} | {{exit_code}} | {{error_summary}} |

### Claude Judgment Failures

{{Claude가 판단한 문제점}}

1. **{{문제 제목}}**
   - File: `{{file_path}}:{{line}}`
   - Issue: {{구체적 문제 설명}}
   - Fix: {{수정 방향 제시}}

## Instructions

- 위 실패 항목만 수정한다 (범위 외 변경 금지)
- 수정 후 관련 테스트가 통과하는지 확인한다
- 새로운 문제를 도입하지 않는다
