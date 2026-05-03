---
paths:
  - "**/*"
---
# Multi-Session Coordination Rules

> 사용자가 FE/BE/BFF 를 다른 Claude Code 세션에서 병렬로 작업할 때 49 브랜치 누적 사태(2026-04-25)를 방지하기 위한 운영 규칙.
>
> 이 규칙은 BRANCH-CONSOLIDATION-2026-04-25 의 회고에서 도출됐다 — 세션 분리 자체는 문제가 아니었고, "통합을 미루고, 다른 세션이 만든 자산을 모르고 중복 작업한 것" 이 원인이었다.

## 1. Session Topology

세션은 도메인 경계를 따라 분리한다. 한 세션 = 한 도메인 = 한 활성 TASK-ID:

| 세션 | 주 디렉토리 | 금지 영역 |
|------|------------|----------|
| **FE** | `apps/web/src/**` (단, `app/api/**` 제외), `packages/ui-kit/**`, `packages/design-tokens/**` | `services/**`, `db/migrations/**`, `apps/web/src/app/api/**` |
| **BE** | `services/**/src/**`, `services/**/tests/**`, `db/migrations/**` | `apps/web/**`, `packages/ui-kit/**`, `packages/design-tokens/**` |
| **BFF** | `apps/web/src/app/api/**`, `apps/web/src/lib/server/**` | `services/**` 내부 로직, `packages/ui-kit/**` 컴포넌트 |
| **공통 (모든 세션)** | `packages/shared-types/**` 만 — **단 한 세션이 hold 후 머지** | 다른 세션은 동시 수정 금지 |

세션이 자기 영역을 벗어나야 하면 작업을 분할하거나, 다른 세션과 합의 후 진입한다.

## 2. shared-types: 세션 충돌의 진짜 원인

`packages/shared-types` 는 BE/FE/BFF 모두 의존하는 단일 계약점이다. 동시 수정 시 즉시 충돌한다. 운영 원칙:

- **계약 먼저**: 새 기능 시작 전 BE 세션이 Zod 스키마를 `packages/shared-types/src/schemas/` 에 작성 → main 에 즉시 머지
- 양쪽 세션이 `import { ... } from '@celebbase/shared-types'` 로 동일 계약 사용
- BE Pydantic 모델 ↔ FE Zod 스키마는 필드명까지 일치 (`.claude/rules/pipeline.md` 의 "BE Pydantic 필드명 실제 확인 후 Zod 작성" 규칙 적용)
- 변경 발생 시 변경 세션이 즉시 main 머지 + 다른 세션은 다음 turn 시작 시 `git pull` 필수

## 3. 세션 시작 루틴 (강제)

매 세션 시작 시 첫 액션으로 실행:

```bash
scripts/session-start.sh <SESSION_ROLE> <TASK-ID>
# SESSION_ROLE: fe | be | bff
# TASK-ID: docs/IMPLEMENTATION_LOG.md 다음 작업 ID (자유 형식)
```

스크립트가 수행하는 것:
1. `git fetch origin --prune`
2. main 과의 차이 확인 (`git log origin/main..HEAD`, `git status --porcelain`)
3. 다른 세션 활동 감지 — 최근 24시간 내 origin 의 다른 브랜치 push 목록
4. shared-types 변경 알림 — `git log origin/main --since="24 hours ago" -- packages/shared-types`
5. 작업 브랜치 자동 생성 (없으면): `feat/<task-id>-<slug>` 또는 `fix/<task-id>-<slug>`
6. worktree 위치 안내: `.worktrees/<TASK-ID>/`

## 4. 통합 주기 (강제)

**"이틀 룰"**: 작업 시작 후 48시간 내 1회 이상 main 머지 또는 PR open.

- 작은 단위로 자주 머지 (PR 1~3 commit 권장)
- 5 commit 이상 누적되면 sub-task 로 쪼갠다
- main 미반영 자산은 다른 세션이 발견 못하므로 중복 위험 ↑

위반 시: 세션 시작 루틴이 경고 출력 + Claude 가 통합 PR 생성을 첫 작업으로 제안.

## 5. 사전 합의 체크리스트 (작업 시작 직전 1회)

새 기능 페어 (예: 새 LLM 동작 = BE + FE 양쪽 영향) 시작 직전 결정 사항을 `pipeline/runs/<COORDINATION-ID>/agreement.md` 에 기록:

- [ ] BE 응답 shape 초안 → shared-types Zod 미리 PR
- [ ] FE 가 호출할 BFF 엔드포인트 이름/메서드 (실구현 전 명세만)
- [ ] 신규 ENV 변수 → 양쪽 `.env.example` 미리 추가
- [ ] DB migration 필요? → BE 세션 단독 처리 (FE/BFF 는 metadata 만 알고 직접 수정 금지)
- [ ] 신규 서비스 포트 → `docker-compose.yml` 충돌 사전 확인

`pipeline/templates/COORDINATION-AGREEMENT.template.md` 에 서식 제공.

## 6. BFF 진입 타이밍

BFF 는 BE/FE 양쪽에 의존하므로 일반적으로 **마지막에 진입**:

- BE 엔드포인트 shape 70%+ 안정화 후
- FE 데이터 요구사항 70%+ 확정 후
- 그전까지 FE 는 mock JSON 으로 진척, BE 는 단독 라우트로 진척

너무 일찍 BFF 시작하면 BE/FE 변경 따라가다 매번 재작성한다.

## 7. 자주 발생하는 함정

| 함정 | 대응 |
|------|------|
| 두 세션이 동시에 `pnpm-lock.yaml` 수정 | conflict 발생 시 항상 `rm pnpm-lock.yaml && pnpm install` 재생성 — 수동 resolve 금지 |
| `docker-compose.yml` 포트 동시 추가 | 신규 서비스 추가 전 `grep -A1 'ports:' docker-compose.yml` 확인 후 합의 |
| `docs/IMPLEMENTATION_LOG.md` 동시 append → conflict | 짧게 자주 머지. 충돌 시 양쪽 entry 모두 보존 (시간순 재배치) |
| BE 가 LLM 응답 shape 자주 변경 → FE 따라가야 함 | 변경 즉시 push + 양쪽 세션 매일 아침 `git pull` 루틴 |
| 한 세션이 다른 영역 침범 | `.claude/rules/multi-session.md` 의 Session Topology 표를 세션 시작 시 Claude 가 자동 인용 |

## 8. 세션 종료 루틴

작업 단위 (TASK-ID) 가 끝나면:

1. `pnpm -r typecheck && pnpm -r lint` 통과 확인
2. `docs/IMPLEMENTATION_LOG.md` 2-commit 패턴 (root CLAUDE.md Workflow 4) 적용
3. PR open or main 직접 머지 (단순 변경)
4. 사용된 브랜치는 머지 후 즉시 origin 에서 삭제. 권장 패턴:
   ```bash
   gh pr merge <NUM> --squash --delete-branch
   # --delete-branch 가 worktree 점유로 실패하면:
   git push origin --delete <branch-name>
   ```
5. 사용된 worktree 는 `git worktree remove` 로 정리

방치하면 49 브랜치 사태 재발한다.

### 8.1 정기 점검 (월 1회 이상)

`gh pr merge --delete-branch` 가 누락되거나 squash/rebase 머지로 ahead 가 남는 케이스가 누적되면 다시 BRANCH-CONSOLIDATION 사태가 발생한다. 다음 명령을 **월 1회 이상** 실행하여 origin 을 정리한다:

```bash
scripts/branch-cleanup.sh           # dry-run — SAFE / ABSORBED / ACTIVE / STALE 분류 출력
scripts/branch-cleanup.sh --apply   # SAFE 카테고리 (PR MERGED + ahead=0) 자동 삭제
```

분류 의미:
- **SAFE**: PR MERGED + main 대비 ahead=0 → `--apply` 시 자동 삭제
- **ABSORBED**: PR MERGED/CLOSED 인데 ahead>0 (squash·rebase 흔적) → `git diff origin/main..origin/<branch>` 로 확인 후 개별 삭제
- **ACTIVE**: PR OPEN 또는 7일 이내 push → 보존
- **STALE**: PR 없음 + 14일 이상 미활동 → 작업 의도 사라진 것은 아닌지 확인 후 삭제

## 9. 충돌 발생 시 우선순위

규칙 충돌 시 우선순위는 root CLAUDE.md Rule 15 를 따른다: **보안 > 개인정보 > 데이터 무결성 > 성능 > 편의**.

이 규칙(multi-session.md)은 "편의·운영 효율" 영역이므로 위 4가지가 우선한다. 즉, 보안/PHI 위반을 막기 위해 세션 경계를 잠시 넘어야 한다면 그 쪽이 우선이다.
