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

> **PIVOT-MOBILE-2026-05 갱신**: active client 가 `apps/mobile` (Expo / RN) 단독으로 전환됨. `apps/web` 의 **SSR/pages/components 만 frozen**, BFF (`apps/web/src/app/api/**`) + server lib (`apps/web/src/lib/server/**`) 은 모바일 의 **active gateway** 로 살아 있다 (Plan v5 IMPL-MOBILE-BFF-001 / SUB-SYNC-002 의존). owner 매핑은 `CLAUDE.md` §1.1 참조.

| 세션 | 주 디렉토리 | 금지 영역 |
|------|------------|----------|
| **FE-Mobile** (Dohyun) | `apps/mobile/**` (Expo / RN), `packages/design-tokens/**` (CSS 변수 + RN 익스포트 빌드 타겟) | `services/**`, `db/migrations/**`, `infra/**`, `apps/web/**`, `packages/ui-kit/**` |
| **BE** (JUNWON) | `services/**/src/**`, `services/**/tests/**`, `db/migrations/**`, `infra/**` | `apps/mobile/**`, `packages/design-tokens/**` 의 RN 익스포트 |
| **BFF** (JUNWON, mobile gateway active) | `apps/web/src/app/api/**`, `apps/web/src/lib/server/**` | `services/**` 내부 로직, mobile 클라이언트 — **mobile-driven 신규 BFF 라우트 추가 OK** (예: `POST /api/subscriptions/sync`). cookie path 는 web 호환 유지, bearer path 는 mobile 전용 (`createProtectedRoute` Bearer fallback). `/auth/refresh` 는 cookie-shaped 이라 mobile 이 user-service 직접 호출 (BFF 미사용 예외). |
| **공통 (모든 세션)** | `packages/shared-types/**` — **단 한 세션이 hold 후 머지** | 다른 세션은 동시 수정 금지 |
| **Frozen (new dev 금지)** | `apps/web/src/app/(app|auth|marketing|slice)/**`, `apps/web/src/components/**`, `packages/ui-kit/**` | 어느 세션도 새 기능 추가 X. 보안·deps 패치만 BE owner (JUNWON) 처리. **BFF (`apps/web/src/app/api/**`) 와 server lib (`apps/web/src/lib/server/**`) 는 frozen 아님** — mobile gateway 로 active. |

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

> **PIVOT-MOBILE-2026-05 갱신 (hybrid BFF)**: 모바일 (`apps/mobile`) 은 web BFF 를 **재사용** — `createProtectedRoute` 가 cookie 와 `Authorization: Bearer` 둘 다 인식 (Plan v5 IMPL-MOBILE-BFF-001). cookie path = web (그대로 유지), bearer path = mobile (신규). 새 mobile-driven BFF 라우트 추가 OK (예: SUB-SYNC-002 `POST /api/subscriptions/sync`). **유일 예외**: `/auth/refresh` 는 BFF 라우트가 cookie-shaped (JSON 토큰 미반환) 이라 mobile 이 user-service `/auth/refresh` 를 직접 호출.

본 절 본문은 PIVOT 이전 (web-only 시절) 의 BFF "마지막 진입" 운영 가이드 — mobile hybrid BFF 시점에는 **BE 서비스의 mobile-facing endpoint 가 안정화된 직후 BFF route 가 같이 따라가는** 패턴이 더 자주 발생한다 (예: SUB-SYNC-001 internal endpoint 머지 → SUB-SYNC-002 BFF 라우트 추가). 아래 가이드는 신규 web 페이지가 추가되는 (재활성화) 시점에만 그대로 적용.

(web 활성 시점 / 신규 web 페이지 추가 시 가이드)

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
| BE/BFF owner 가 mobile 검증 위해 Expo Go 사용 | **Expo Go 는 UI/JS preview only** — 인증/IAP/native module 검증은 dev build 필수. 아래 §7.1 참조 (CHORE-MOBILE-DEV-BUILD-LOCAL-001 lesson, 2026-05-15 incident) |
| project path 에 공백/한글/특수문자 | iOS native build (CocoaPods build script) 가 path quote 처리 안 해서 첫 공백에서 truncate. clone 위치는 ASCII + 공백 0 강제 (예: `~/celebase/`) |
| staging schema drift (migration 누락) | CD pipeline 에 migration runner 미통합 → 수동 적용 의존. backlog `CHORE-STAGING-MIGRATION-AUTORUN-001` |

### 7.1 Mobile dev environment (CHORE-MOBILE-DEV-BUILD-LOCAL-001 lesson)

`apps/mobile` 영역은 owner 이외에도 **BE/BFF owner 가 계약 변경 시 검증할 수 있어야** 한다. mobile 검증 capability 부재가 production-class incident 를 staging 까지 가린 사례 (2026-05-15 6시간 incident, `docs/SESSION-2026-05-15-mobile-auth-incident.md`) 가 있어 다음을 표준화한다.

#### Expo Go 한계 (사용 금지 영역)

Expo Go 는 App Store 의 사전 컴파일된 단일 앱이라 **임의 third-party native module 동적 로드 불가**. 다음 native deps 는 **반드시 실패**:

- `@aws-amplify/react-native` (Cognito SRP `modPow` native binding) — 우리 mobile 인증의 핵심
- `react-native-purchases` (RevenueCat) — 우리 mobile IAP
- 향후 추가될 Sentry / Crashlytics / 다른 vendor native SDK

증상: 호출 직전 native binding `Proxy.get` 에서 throw → Amplify SDK 의 `assertServiceError` 가 `name === 'Error'` 케이스에서 매핑 실패 → generic `[Unknown: An unknown error has occurred.]` wrap. underlying error 까지 까봐야 진짜 원인 보임 (`AmplifyError.underlyingError` 필드).

**Expo Go 가 OK 한 경우**: UI 화면 시각 확인, JS 로직만 변경 (네트워크 호출 없는 component preview), 신규 contributor 의 "처음 화면 띄우기" 검증.

#### 권장 dev environment (인증/IAP/실제 BFF 호출 검증)

**Option A — local dev build (`npx expo run:ios`)** ⭐ 권장 (Mac + Xcode 보유자):

```bash
cd apps/mobile
npx expo run:ios   # 첫 빌드 ~10분 (Pods), 이후 JS 변경은 hot reload
```

전제: Xcode + CocoaPods (`brew install cocoapods`) 설치. `apps/mobile/eas.json` 의 `development.ios.simulator=true` 이미 설정됨.

**Option B — EAS cloud build** (Apple Developer 계정 있을 때, 실기 검증 필요):

```bash
eas build --profile development --platform ios   # ~15분 cloud build
```

결과 .ipa 를 실기 iPhone 에 ad-hoc 설치 (TestFlight 또는 QR). Face ID / Camera / Push 같은 실기 native API 검증 시.

#### Project path 제약

clone 위치 path 에 **공백/한글/특수문자 금지**. CocoaPods 의 `[CP-User] Generate app.config for prebuilt Constants.manifest` 같은 build script 가 path quote 처리 안 해서 첫 공백 위치에서 truncate → `No such file or directory: /Users/.../first_token` build fail.

권장: `~/celebase/` 같은 단순 path. 기존 clone 이 공백 path 면 mv 후 cleanup:

```bash
mv "OLD_PATH" "$HOME/celebase"
cd "$HOME/celebase/<repo>"

# 절대 path 박힌 prebuild artifacts 제거
rm -rf apps/mobile/ios apps/mobile/android apps/mobile/.expo

# 절대 path 박힌 pnpm symlinks 모두 제거 (find + glob 함정 회피)
find . -name node_modules -type d -prune -exec rm -rf {} +

# Xcode 의 옛 path 캐시 제거
rm -rf ~/Library/Developer/Xcode/DerivedData

# 재설치 + workspace dist 정합
pnpm install
pnpm --filter @celebbase/design-tokens build
pnpm --filter @celebbase/shared-types build
```

**주의**: `npm install` 금지 (root 만 깔리고 workspace 안 깔림). 본 monorepo 는 `pnpm-lock.yaml` 사용 — 항상 `pnpm install`. 잘못 `npm install` 돌렸으면 `rm -f package-lock.json` 후 `pnpm install`.

#### 검증 capability 요구

BE/BFF 영역의 `shared-types` 스키마 변경 PR 작성 시, 작성자는 다음 중 하나 가능 상태여야 한다:

1. local dev build (`npx expo run:ios`) 환경 정착 — 본인 Mac 에서 mobile 화면 띄울 수 있음
2. 또는 EAS development build 셋업

이 capability 가 없으면 mobile-facing 계약 변경 시 review 단계에서 sanity check 불가 → staging 도달까지 회귀 발견 지연. multi-session §1 의 owner 경계는 유지하되, **검증 capability 는 모든 세션이 보유**.

#### Underlying error 디버깅 패턴

Amplify v6 의 generic `Unknown` error 를 만나면 즉시 `err.underlyingError` 까지 까야 함:

```typescript
// LoginScreen.tsx 등 catch block — 디버깅 시점만 활성, 검증 후 제거
} catch (err) {
  if (err !== null && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // eslint-disable-next-line no-console
    console.warn('[debug] err:', { name: e['name'], message: e['message'], underlyingError: e['underlyingError'] });
  }
  setError(mapErrorToMessage(err));
}
```

`underlyingError` 의 `name` 이 진짜 root cause — 예: `Error: The package '@aws-amplify/react-native' doesn't seem to be linked. ... You are not using Expo Go`.

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

## 10. Recovery Patterns

### 10.1 Stacked PR 분기 (multi-session §1 위반 사후 회복) — IMPL-021 교훈

한 브랜치에 두 도메인 commit 이 누적되면 (예: IMPL-019 seeds + IMPL-021 admin 동일 브랜치) PR diff 가 혼합되어 review 가 어려워진다. force-push 없이 비파괴적으로 분기하는 패턴:

```bash
# 1) 신규 브랜치를 현재 HEAD 에서 cut — 두 번째 도메인 PR 본거지
git branch feat/<NEW-DOMAIN>-<slug> HEAD

# 2) PR base 를 첫 번째 도메인 브랜치로 지정 → diff 가 두 번째 도메인 commit 만 표시
gh pr create --base feat/<FIRST-DOMAIN>-<slug> --head feat/<NEW-DOMAIN>-<slug> ...

# 3) 첫 번째 PR squash-merge 후 두 번째 PR 을 main 으로 retarget (gh PR UI 또는 git push -f 없이 base 변경)
gh pr edit <NUM> --base main
```

조건:
- 첫 번째 도메인 commit 이 origin 에 이미 push 되어 있어 force-push 불필요
- 두 번째 도메인 commit 이 첫 번째 위에 깔끔하게 쌓여 있음 (interleave 없음)

interleave 발생 시: 신규 브랜치에서 cherry-pick 으로 두 번째 도메인 commit 만 골라 재조립 후 force-push (단일 신규 브랜치이므로 force-push 영향 범위 제한적).

적용 사례: PR #26 (IMPL-021) base = `feat/IMPL-019-validator-phase-a` (PR #25 head).
