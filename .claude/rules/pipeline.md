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

### CODEX-HANDOFF 크기 제한 (필수)

**한 HANDOFF에서 생성/수정하는 파일은 최대 8개**로 제한한다.

- 파일 수가 8개를 초과하면 작업을 하위 태스크(TASK-ID-a, TASK-ID-b)로 분리한다
- 판단 기준: repository × N + service × N + route × N + test × N 합산
- 예: repository(3) + service(3) + route(3) + test(3) = 12개 → a(repo+svc) / b(route+test+index)로 분리

이유: Codex가 ~140K 토큰에서 "can't complete in single response"로 중단하며, 이 경우 `codex exec`이 exit 0을 반환해 파이프라인이 무음 실패한다.

## 게이트 판정 원칙

### 자동 체크 (scripts/gate-check.sh)
- 하나라도 fail이면 전체 fail → 수정 요청

### Claude 판정 (자동 체크 통과 후)
- **엄격**: 보안 규칙 위반, PHI 처리 오류, 서비스 경계 위반
- **보통**: 아키텍처 일관성, 테스트 충분성
- **관대**: 코드 스타일 (lint 통과했으면 OK)
- `pipeline/templates/gate-criteria.yaml`의 판정 항목을 순회한다

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

### QA 단계 가짜 pytest stub 방지 (IMPL-004-b 교훈)

Codex QA 에이전트가 pytest 실행에 실패하면 `pytest/` 디렉토리를 만들고 `print("N tests PASS")`를 출력하는 가짜 stub을 생성할 수 있다.
gate-qa 판정 시 Claude가 직접 `python3 -m pytest` 를 실행해 실제 통과 여부를 확인해야 한다.
가짜 stub이 발견되면 즉시 삭제 후 재실행.
