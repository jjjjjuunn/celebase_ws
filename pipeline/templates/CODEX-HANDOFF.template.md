# CODEX-HANDOFF: {{TASK_ID}}

> 이 문서는 Claude가 작성하여 Codex에게 전달하는 구현 명세이다.
> Codex는 이 문서의 요구사항을 정확히 구현해야 한다.

## Task

**ID**: {{TASK_ID}}
**Title**: {{TASK_TITLE}}
**Type**: {{feat | fix | refactor | test | chore}}

## Context

{{이 작업이 필요한 이유와 배경. spec.md의 관련 섹션 참조.}}

## Affected Packages/Services

{{변경 대상 패키지/서비스 경로 목록}}

- `services/{{service-name}}/`
- `packages/{{package-name}}/`

## Requirements

{{번호 매겨진 요구사항 목록. 각 항목은 검증 가능해야 한다.}}

1. ...
2. ...
3. ...

## Acceptance Criteria

{{이 작업이 완료되었음을 판단하는 기준}}

- [ ] ...
- [ ] ...

## Constraints

- CODEX-INSTRUCTIONS.md의 모든 규칙을 준수한다
- 위에 나열된 패키지/서비스 외의 파일을 수정하지 않는다
- 새 코드에 대한 테스트를 작성한다
- TypeScript strict mode, `any` 타입 금지
- 외부 입력은 Zod(TS) / Pydantic(Python)으로 검증한다

## DB Schema (repository/query 작업 시 필수)

> Repository 또는 SQL 쿼리 변경이 포함된 작업은 이 섹션을 반드시 채운다.
> Migration 파일에서 대상 테이블 DDL을 복붙한다.
> 해당 없으면 "N/A — DB 변경 없음" 으로 표기.

**Migration file**: `db/migrations/{{파일명}}` lines {{X}}-{{Y}}

```sql
{{CREATE TABLE 또는 ALTER TABLE DDL 전문}}
```

**API→DB 매핑** (API 필드와 DB 컬럼이 1:1이 아닌 경우):

| API field | DB column | Transform |
|-----------|-----------|-----------|
| {{...}}   | {{...}}   | {{...}}   |

## Reference Files

{{구현 시 참고해야 하는 기존 파일 경로}}

- `spec.md` §{{섹션 번호}}
- ...

## Anti-Patterns (DO NOT)

{{이 작업에서 특히 주의해야 할 안티패턴}}

- ...
