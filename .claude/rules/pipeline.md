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

## CODEX-HANDOFF 작성 기준

- `pipeline/templates/CODEX-HANDOFF.template.md`를 기반으로 작성
- Requirements 섹션: 각 항목은 검증 가능한 단일 동작으로 작성
- Affected Paths: 변경 대상을 명확히 제한 (범위 외 변경 방지)
- Anti-Patterns: 해당 작업에서 특히 주의할 패턴 명시
- spec.md의 관련 섹션 번호를 Reference에 포함

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
