---
paths:
  - ".claude/tasks.yaml"
  - ".claude/tasks.schema.json"
---
# Task YAML 작성 규칙

> `.claude/tasks.yaml` 과 `.claude/tasks.schema.json` 의 drift 재발 방지를 위한 표기 표준.
> 신규 task 추가 시 반드시 이 문서를 따른다. CI `validate-schemas` job 이 위반을 자동 차단한다.

## ID 형식

- **기본**: `<DOMAIN>-<NNN>` (예: `IMPL-001`, `BOOT-003`, `CHORE-001`)
- **분할 sub-task**: `<DOMAIN>-<NNN>-<x>` (예: `IMPL-004-a`, `IMPL-004-b`, `IMPL-004-c`)
- 규칙:
  - DOMAIN: 대문자 1자 이상
  - NNN: 정확히 3자리 숫자 (0 padding)
  - x: 소문자 알파벳 1글자 (a, b, c, …)
- 스키마 regex: `^[A-Z]+-\d{3}(-[a-z])?$`

## Owner 형식

- **단일**: `agent-<actor>` 또는 `human-<actor>`
  - 예: `agent-codex`, `agent-claude-opus-4-6`, `human-junwon`
- **복합 (co-authored)**: `<owner1> + <owner2>` (두 owner 사이에 ` + ` — 양쪽 공백 포함)
  - 예: `agent-claude-opus-4-6 + agent-codex-o3`
- 스키마 regex: `^(agent-[a-z0-9-]+|human-[a-z0-9-]+)( \+ (agent-[a-z0-9-]+|human-[a-z0-9-]+))*$`

### `agent-` / `human-` prefix 가 필수인 이유

이는 **보안 장치** 다. 에이전트가 `human-junwon` 처럼 자기 자신을 사람으로 위장해 cross-check (예: IMPLEMENTATION_LOG 의 `verified_by`) 를 우회하는 것을 방지한다. **prefix 없이 bare model name (`claude-opus-4-6`, `codex`) 을 owner 로 쓰면 schema validation 이 fail 한다.**

## 검증

- **자동**: `.github/workflows/ci.yml` 의 `validate-schemas` job 이 매 PR 마다 `.claude/tasks.schema.json` 으로 검증 → 위반 시 CI fail → 머지 차단
- **로컬 dry-run**:
  ```bash
  python3 -c "
  import json, yaml, jsonschema
  tasks = yaml.safe_load(open('.claude/tasks.yaml'))
  schema = json.load(open('.claude/tasks.schema.json'))
  jsonschema.validate(tasks, schema)
  print('PASS')
  "
  ```

## 변경 이력

- 2026-04-17 (CHORE-001): 초기 문서 작성. 7개월간 누적된 10건 drift 정리 후 재발 방지 목적.
