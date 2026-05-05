# FE Onboarding — CelebBase Wellness

> **Audience**: 이 레포에 처음 합류한 프론트엔드 팀원 (또는 그 팀원이 사용하는 Claude Code / Codex / Cursor 등 코딩 에이전트).
> **목적**: 첫 세션 시작 시 이 문서 하나만 읽으면 작업 영역·정책·환경 셋업을 다 알 수 있게 한다.
> **작성일**: 2026-05-04. 변경 시 본 파일 + `.claude/rules/multi-session.md` 양쪽 갱신.

---

## 0. 한 페이지 요약

- 너는 **FE 세션** 이다. `apps/web/src/**` (단 `app/api/**` 제외), `packages/ui-kit/**`, `packages/design-tokens/**` 만 만진다.
- `services/**`, `db/migrations/**`, `apps/web/src/app/api/**`, `packages/shared-types/**` 직접 수정은 **금지**. 필요하면 BE 담당자에게 요청.
- 모든 작업은 `feat/IMPL-UI-XXX-<slug>` 또는 `fix/IMPL-UI-XXX-<slug>` 브랜치에서. `main` 직접 push 금지 (branch protection 으로 차단됨).
- 색·간격·반경은 **`--cb-*` CSS 변수만** 사용. raw hex (`#aabbcc`) 금지 — `scripts/gate-check.sh fe_token_hardcode` 가 자동 검출.
- React hook 쓰는 컴포넌트·페이지는 파일 최상단에 `'use client';` 필수.
- 48시간 내 1회 이상 PR open 또는 main 머지 (브랜치 누적 방지).
- 막히면 → §10 트러블슈팅 → 그래도 막히면 BE 담당자.

---

## 1. 환경 셋업 (최초 1회)

### 1.1 사전 요구사항

- **Node.js**: v20.x LTS (`.nvmrc` 또는 `package.json` engines 참조)
- **pnpm**: corepack 으로 활성화
- **Docker Desktop**: BE 서비스 + PostgreSQL + Redis 를 띄우는 데 필수
- **Git**: SSH key 가 GitHub 에 등록돼 있어야 private repo clone 가능

### 1.2 단계별 명령

```bash
# 1) clone (SSH)
git clone git@github.com:<org>/celebase_ws.git
cd celebase_ws

# 2) Node 버전 맞추기
nvm install
nvm use

# 3) pnpm 활성화
corepack enable
corepack prepare pnpm@latest --activate

# 4) 의존성 설치 (모노레포 전체)
pnpm install

# 5) workspace 패키지 빌드 (FE 가 의존하는 3개 패키지)
pnpm --filter shared-types build
pnpm --filter design-tokens build
pnpm --filter ui-kit build

# 6) 로컬 git hook 설치 (필수 — pre-commit 검증)
bash scripts/install-hooks.sh

# 7) .env.local 만들기 (시크릿은 별도 채널로 받음 → §3)
cp .env.example .env.local
# 비어있는 시크릿 값을 1Password / Bitwarden vault 에서 받아 채워넣기

# 8) Docker 로 BE 서비스 띄우기
docker compose up -d
docker compose ps   # 모든 서비스 healthy 확인
# DB 초기 마이그레이션이 필요하면 BE 담당자에게 dump 요청

# 9) FE dev server 실행
pnpm --filter web dev
# → http://localhost:3000
# → /slice/* 경로에서 컴포넌트 미리보기 가능 (preview routes)
```

### 1.3 셋업 검증 체크리스트

작업 시작 전 다음이 모두 성공해야 한다:

- [ ] `pnpm --filter web typecheck` → 0 error
- [ ] `pnpm --filter web lint` → 0 error
- [ ] `pnpm --filter web dev` → http://localhost:3000 에서 200 응답
- [ ] http://localhost:3000/slice 에서 200 응답 (preview shell 살아있음)
- [ ] `docker compose ps` → 모든 컨테이너 `running` 또는 `healthy`
- [ ] `git config core.hooksPath` 가 `.githooks` 또는 설치된 경로를 가리킴

하나라도 실패하면 BE 담당자에게 즉시 알림. 우회·skip 금지.

---

## 2. 작업 영역 — 무엇을 만질 수 있고 무엇은 못 만지나

`.claude/rules/multi-session.md` 의 Session Topology 표를 그대로 옮긴 것이다. 위반 시 PR 머지 차단.

| 영역 | 접근 권한 | 비고 |
|------|----------|------|
| `apps/web/src/app/**` (단 `app/api/**` 제외) | ✅ 자유 수정 | App Router page, layout, components |
| `apps/web/src/components/**` | ✅ 자유 수정 | FE 전용 컴포넌트 |
| `apps/web/src/lib/**` (단 `lib/server/**` 제외) | ✅ 자유 수정 | client-side helper |
| `packages/ui-kit/**` | ✅ 자유 수정 | 공용 컴포넌트 (디자인 시스템) |
| `packages/design-tokens/**` | ⚠ 신중히 수정 | 토큰 추가 시 `DESIGN.md` 변경 동반 — BE 와 합의 |
| **`apps/web/src/app/api/**`** | ❌ 금지 | BFF 영역. BE 담당. |
| **`apps/web/src/lib/server/**`** | ❌ 금지 | BFF server-only 코드 |
| **`services/**`** | ❌ 금지 | BE 마이크로서비스 |
| **`db/migrations/**`** | ❌ 금지 | DB 스키마 |
| **`packages/shared-types/**`** | ❌ 직접 수정 금지 | BE/FE/BFF 공통 계약점. 필요 시 BE 에 요청 |
| `docker-compose.yml`, `.env.example`, `.github/**` | ❌ 금지 | 운영 설정 |
| `spec.md`, `DESIGN.md`, `CLAUDE.md`, `.claude/**` | ❌ 금지 | 거버넌스 문서 |
| `pipeline/**`, `scripts/**` | ❌ 금지 | 파이프라인 도구 |
| `docs/IMPLEMENTATION_LOG.md` | ✅ append-only | 작업 완료 시 entry 추가 (§7 참조) |
| `docs/ONBOARDING-FE.md` (이 파일) | ⚠ PR 필요 | 개선 사항 발견 시 PR |

### 2.1 영역 외부에 손이 가야 한다면

- shared-types 에 새 필드가 필요 → **BE 담당자에게 요청**. BE 가 `packages/shared-types/src/schemas/` 에 Zod 스키마 추가 → main 머지 → 너는 `git pull` 후 사용.
- 새 BFF endpoint 가 필요 → BE 담당자에게 요청. mock JSON 으로 우선 진행.
- DB 컬럼이 필요 → BE 담당. 절대 마이그레이션 직접 추가 금지.

---

## 3. 시크릿 / 환경변수 / 외부 자원

### 3.1 시크릿 전달 채널

- **절대 Slack/이메일/카톡 평문 금지**.
- `.env.local` 의 시크릿 값은 **1Password (또는 Bitwarden) shared vault** 로 받는다.
- vault 항목: `CelebBase Dev — .env.local for FE` — 첨부파일로 전체 `.env.local` 받아서 그대로 사용.
- API 키 / DB password / JWT secret 은 **dev 환경 전용**. prod 키는 절대 받지 마라 (받았으면 즉시 폐기 요청).

### 3.2 외부 자원 — 어떤 걸 어떻게 쓰나

| 자원 | 어디서 오나 | 너의 행동 |
|------|------------|----------|
| PostgreSQL | `docker compose up -d` 로 로컬 컨테이너 | dev DB. 마음대로 truncate/seed 가능 |
| Redis | 로컬 컨테이너 | 동상 |
| LocalStack (S3, SQS 등) | 로컬 컨테이너 | AWS 흉내냄. 실제 AWS 절대 호출 안 함 |
| Stripe | `sk_test_*` test key | dev .env.local 에 들어있음. 실거래 발생 안 함 |
| Anthropic / OpenAI API | dev 키 | 비용 한도 있음. 무한 루프 호출 주의 |
| 실제 AWS | ❌ 사용 금지 | FE 작업에 필요 없음. credential 도 받지 마라 |
| Cognito | docker compose 또는 staging | 로그인 흐름 테스트 시 |

### 3.3 본인이 발급해야 할 것 (선택)

원한다면 본인 명의로 발급하는 게 더 안전:

- Stripe test account → 본인 명의 무료 계정, test key 무한 발급
- Anthropic / OpenAI API key → 본인 계정 (개인 비용)

발급한 키는 본인 `.env.local` 에만. 레포에 commit 금지.

### 3.4 .env.local 검증

dev server 띄우기 전 다음이 채워졌는지 확인:

```bash
grep -E "^[A-Z_]+=" .env.local | grep -E "=$|=\"\"$"
# 위 명령이 아무 줄도 안 출력하면 OK (모든 키에 값이 있음)
```

빈 값이 있으면 vault 에서 다시 가져온다.

---

## 4. 작업 흐름 — 새 태스크 시작부터 머지까지

### 4.1 세션 시작 루틴

매 세션 시작 시 (Claude Code 새로 켤 때) 첫 액션:

```bash
# 1) main 동기화
git checkout main
git pull origin main

# 2) 모노레포 의존성 갱신 확인 (lockfile 변했으면 install)
pnpm install

# 3) shared-types 변경 있었나 확인
git log origin/main --since="24 hours ago" -- packages/shared-types
# 변경 있으면 그 PR 내용 읽고 진행

# 4) 작업 브랜치 생성
git checkout -b feat/IMPL-UI-XXX-<slug>

# 5) (선택) 자동 도우미
bash scripts/session-start.sh fe IMPL-UI-XXX
```

### 4.2 태스크 ID

- 형식: `IMPL-UI-###` 또는 `IMPL-UI-###-<slug>`
- BE 담당자가 `docs/IMPLEMENTATION_LOG.md` 에 다음 후보를 넣어두거나, 본인이 GitHub Issue 로 받은 번호 사용
- 첫 태스크는 BE 담당자가 `pipeline/runs/IMPL-UI-XXX/FE-CODEX-HANDOFF.md` 형태로 따로 줄 것이다 — 그 문서가 정답지

### 4.3 구현 중 지켜야 할 것

#### 4.3.1 토큰 강제

```tsx
// ❌ 금지
<div style={{ color: '#1A1917', padding: '16px' }} />
<div className="bg-[#FAFAF8]" />  // Tailwind arbitrary value 도 금지

// ✅ 필수
<div className={styles.root} />
// styles.module.css:
//   .root { color: var(--cb-neutral-900); padding: var(--cb-space-4); }
```

신규 색이 필요하면 **먼저** `packages/design-tokens/tokens.css` 에 `--cb-*` 토큰을 추가 (BE 와 합의 후 PR), 그다음 컴포넌트에서 참조.

#### 4.3.2 'use client'; 강제

React hook (`useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`) 또는 onClick/onChange 같은 이벤트 핸들러 prop 을 사용하는 파일은 **최상단에 `'use client';` 한 줄 필수**:

```tsx
'use client';

import { useState } from 'react';
// ...
```

누락 시 Next.js App Router 에서 `You're importing a component that needs useState...` 빌드 실패.

#### 4.3.3 ui-kit 컴포넌트 패턴

- 파일 구조: `packages/ui-kit/src/components/<Name>/<Name>.tsx` + `<Name>.module.css` + `index.ts` (re-export)
- 새 컴포넌트 추가 시 `packages/ui-kit/src/index.ts` 에 export 추가
- CSS Modules 가 dist 에 자동 복사되도록 `packages/ui-kit/scripts/copy-css.mjs` 가 동작 — 빌드 후 `dist/components/<Name>/*.module.css` 존재 확인

#### 4.3.4 /slice/* preview

새 컴포넌트는 `apps/web/src/app/slice/<name>/page.tsx` 에 preview 페이지를 만들어야 한다. mock 데이터 inline 으로 카드 변형들을 렌더한다. 검증:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/slice/<name>
# 200 떨어져야 함
```

#### 4.3.5 a11y

- `<img>` 는 항상 `alt` 채우기. 장식 이미지면 `alt=""` 명시.
- 색만으로 정보 전달 금지 (예: trust_grade 배지에 "Grade A" 텍스트 같이 표시).
- 인터랙티브 요소는 키보드 접근 가능, focus-visible 시 `--cb-shadow-focus` 표시.
- health disclaimer 는 `role="note"`. 절대 `aria-hidden`, `display: none` 금지.

### 4.4 커밋·PR 규칙

#### 4.4.1 커밋 메시지

```
<type>(<scope>): <TASK-ID> — <한 줄 요약>

<상세 (선택)>
```

- type: `feat` / `fix` / `chore` / `docs` / `test` / `refactor`
- scope: `web` / `ui-kit` / `design-tokens`
- 예: `feat(ui-kit): IMPL-UI-FEED — add ClaimCard with 5 states`

#### 4.4.2 PR 크기

- **PR 1개 = 1~3 commit 권장**, 5+ commit 누적되면 sub-task 로 쪼갠다.
- 모노레포 전체에 걸친 거대 PR 금지.

#### 4.4.3 PR 본문 템플릿

```markdown
## 무엇을 했나
- ClaimCard 컴포넌트 5 상태 (default/hover/pressed/focus/skeleton)

## 왜
- IMPL-UI-FEED HANDOFF DoD 항목 #1~#3

## DoD 충족 근거
- [ ] `pnpm --filter web typecheck` → 0 error (로그)
- [ ] `pnpm --filter web lint` → 0 error (로그)
- [ ] `scripts/gate-check.sh fe_token_hardcode` → passed:true
- [ ] http://localhost:3000/slice/claim-card 200 응답 (스크린샷)
- [ ] (선택) Playwright MCP a11y 리포트

## 영향 범위
- packages/ui-kit/src/components/ClaimCard/**
- apps/web/src/app/slice/claim-card/page.tsx
```

#### 4.4.4 PR 후 흐름

1. CI 가 lint / typecheck / test 자동 실행
2. CODEOWNERS 가 자동으로 BE 담당자를 reviewer 로 지정
3. 1명 approval + CI green → squash merge
4. 머지 후 `gh pr merge --squash --delete-branch` 자동 실행

### 4.5 IMPLEMENTATION_LOG 작성 (2-commit 패턴)

작업 완료 시 `docs/IMPLEMENTATION_LOG.md` 에 entry 추가. 이건 두 단계로 나뉜다:

```bash
# Step 1: feat 커밋 안에 log entry 포함 (commit_sha: PENDING 으로)
# pipeline/templates/IMPL-LOG-ENTRY.template.md 복사해서 채움
git add docs/IMPLEMENTATION_LOG.md packages/ui-kit/...
git commit -m "feat(ui-kit): IMPL-UI-FEED — add ClaimCard with 5 states"

# Step 2: PR 머지 후, 머지된 commit SHA 를 PENDING 자리에 채워서 별도 commit
bash scripts/record-log-sha.sh IMPL-UI-FEED
# → docs(log): record IMPL-UI-FEED commit SHA 라는 별도 commit 생성
```

자세한 포맷은 `pipeline/templates/IMPL-LOG-ENTRY.template.md` 참조. front-matter YAML 스키마 엄수, heading-only 스타일 금지.

---

## 5. shared-types — 모노레포의 단일 계약점

`packages/shared-types` 는 BE/FE/BFF 모두 의존하는 공통 Zod 스키마. **너는 이 패키지를 직접 수정하지 마라.**

### 5.1 BE 가 변경했을 때 너의 행동

```bash
# 매일 아침 또는 세션 시작 시
git checkout main
git pull origin main
pnpm install
pnpm --filter shared-types build

# 변경 내용 확인
git log -1 --stat -- packages/shared-types/
```

기존 코드에 type error 가 나면 BE 가 필드명을 바꾼 것일 수 있다. shared-types 의 새 schema 에 맞춰 FE 코드 수정.

### 5.2 새 필드가 필요할 때

1. BE 담당자에게 요청 (Slack 또는 GitHub Issue): "ClaimCard 에 `bookmark_count` 필드 필요"
2. BE 가 `packages/shared-types/src/schemas/lifestyle-claims.ts` 에 추가 + main 머지
3. 너는 pull 받고 사용

절대 본인이 직접 추가하지 마라. BE Pydantic 모델과 어긋나면 런타임 에러 발생.

---

## 6. 빈번한 함정 (미리 경고)

| 함정 | 증상 | 대응 |
|------|------|------|
| `'use client';` 누락 | `You're importing a component that needs useState...` | 파일 최상단 한 줄 추가 |
| raw hex 사용 | `scripts/gate-check.sh fe_token_hardcode` FAIL | `--cb-*` 토큰으로 교체 |
| Fraunces 카드 안 사용 | DESIGN.md §3.3 위반 | Plus Jakarta Sans 로 교체 (`--cb-h3` 등) |
| webpack chunk cache stale | `/slice/*` 가 `Cannot find module './xxx.js'` 500 | dev server kill → `rm -rf apps/web/.next/cache apps/web/.next/server` → 재시작 |
| `pnpm-lock.yaml` 충돌 | merge conflict | `rm pnpm-lock.yaml && pnpm install` 로 재생성. 수동 resolve 금지 |
| `IMPLEMENTATION_LOG.md` 충돌 | 양쪽 entry 있음 | 둘 다 보존, 시간순 재배치 |
| ui-kit `.module.css` dist 누락 | runtime 스타일 안 먹힘 | `packages/ui-kit/scripts/copy-css.mjs` 빌드 체인 확인 |
| CSP dev 모드 `unsafe-eval` 누락 | 폼이 API 호출 없이 GET 으로 제출됨, console 에 `EvalError` | `middleware.ts` 의 `buildCsp` 가 dev 일 때 `'unsafe-eval'` 포함하는지 확인 |
| JWT issuer 불일치 | 로그인은 200 인데 protected API 에서 401 | `.env.local` 의 `INTERNAL_JWT_ISSUER` 와 `docker-compose.yml` 의 user-service 환경변수 동일한지 확인 |

자세한 case study 는 `.claude/rules/pipeline.md` 의 "FE 파이프라인 규칙" 섹션 참조.

---

## 7. 파이프라인 — Codex 또는 직접 구현

작업 규모에 따라 둘 중 하나:

### 7.1 단순 작업 (1~2 파일 변경, typo, 토큰 교체)

→ **에이전트가 직접 구현**. 파이프라인 호출 불필요. PR 만 잘 만들면 OK.

### 7.2 3+ 파일 변경 또는 새 컴포넌트

→ Codex 파이프라인 사용 (BE 담당자가 셋업해 둠):

```bash
# 본인이 호출하는 게 아니라 BE 담당자가 호출하거나 합의 후 진행
scripts/pipeline.sh IMPL-UI-XXX init
# 그러면 .worktrees/IMPL-UI-XXX/ 에 격리 환경 생성됨
```

자세한 흐름은 `.claude/rules/pipeline.md` 참조. 일반적으로 FE 컴포넌트는 Codex 보다 본인 직접 구현이 빠르다 (JSX 복잡도로 Codex heredoc 실패 잦음).

---

## 8. 디자인 reference

이 작업의 시각 reference 는 `docs/design/claim-card/` 디렉토리에 있다 (Claude Design 결과물 4개 artifact). HTML 파일이라 브라우저로 열어서 시각 확인 후 ui-kit 패턴으로 다시 짠다. **결과 HTML 을 그대로 복붙하지 마라** — 우리는 CSS Modules + `--cb-*` 토큰 + `'use client';` 패턴이다.

기준 문서:
- `DESIGN.md` — 디자인 시스템 v1.0 (토큰·타이포·컴포넌트 스펙)
- `docs/design-prompts/claim-card-feed-prompt.md` — 이번 화면의 도메인 모델·anatomy·mock 데이터·강제 제약
- `spec.md` §3.5 (LifestyleClaim 도메인) / §7.2 (Tab 1 Discover) / §9.3 (claim 7원칙)

---

## 9. 작업 시작 직전 — Pre-flight 체크

새 태스크 시작 시 다음을 모두 만족해야 한다. 하나라도 NO 면 멈추고 BE 담당자에게 알림.

- [ ] `git status` clean
- [ ] `git log origin/main..HEAD` 비어있음 (main 과 동기화됨)
- [ ] 셋업 검증 체크리스트 (§1.3) 모두 통과
- [ ] 작업 대상 TASK-ID 의 HANDOFF 문서 (`pipeline/runs/IMPL-UI-XXX/FE-CODEX-HANDOFF.md`) 존재 + 다 읽음
- [ ] 영역 외부 변경이 필요하지 않다 (shared-types 등). 필요하면 먼저 BE 에 요청.
- [ ] `.env.local` 비어있는 키 없음

---

## 10. 트러블슈팅 — 자주 묻는 것

### 10.1 dev server 가 안 떠요

```bash
# 1) 포트 충돌 확인
lsof -i :3000
# 다른 프로세스 죽이거나 PORT 환경변수로 우회

# 2) .next 캐시 비우기
rm -rf apps/web/.next
pnpm --filter web dev

# 3) Docker BE 살아있나
docker compose ps
# 죽은 게 있으면 docker compose up -d
```

### 10.2 typecheck 가 `Cannot find module '@celebbase/...'` 에러

```bash
# workspace 패키지 dist 가 없는 것
pnpm --filter shared-types build
pnpm --filter design-tokens build
pnpm --filter ui-kit build
```

### 10.3 `/slice/*` 가 500 응답

```bash
# webpack chunk cache stale (워크스페이스 패키지 재빌드 후 자주 발생)
# dev server 죽이고:
rm -rf apps/web/.next/cache apps/web/.next/server
pnpm --filter web dev
```

### 10.4 lint 가 unfamiliar 한 룰로 fail

먼저 `.eslintrc` 또는 `eslint.config.mjs` 의 룰을 확인. CelebBase 는 `restrict-template-expressions`, `noImplicitOverride`, `exactOptionalPropertyTypes` 등이 켜져있다. `.claude/rules/pipeline.md` 의 "TypeScript 주의 패턴" 섹션이 자주 걸리는 케이스 모음.

### 10.5 CI 가 "Semgrep high/critical = 0" 으로 fail

보안 룰 위반. 보통:
- raw URL 을 사용자 입력에서 받아 fetch (SSRF) → allowlist 체크 추가
- `dangerouslySetInnerHTML` 사용 → text node 로 교체
- `eval()`, `new Function()` 사용 → 절대 금지

해결 못 하면 BE 담당자에게 즉시 문의.

### 10.6 PR 이 머지 안 돼요

확인:
1. CI 모든 status check green?
2. CODEOWNERS reviewer 승인 받음?
3. main 과 conflict 없음? (`git merge main` 으로 해결)
4. `docs/IMPLEMENTATION_LOG.md` 검증 통과? (front-matter YAML 스키마)

---

## 11. 우선순위 충돌 시

CelebBase Constitution (`CLAUDE.md` § 2 Rule 15):

**보안 > 개인정보 > 데이터 무결성 > 성능 > 편의**

이 문서의 룰과 보안/개인정보 룰이 충돌하면 보안/개인정보가 우선. 즉, 작업 영역 경계를 넘어야 보안 이슈를 막을 수 있다면 그쪽이 옳다 (단, BE 담당자에게 즉시 알림 필수).

---

## 12. 자주 참조할 문서 (북마크)

| 문서 | 언제 |
|------|------|
| `CLAUDE.md` | Constitution. 모든 작업의 헌법 |
| `DESIGN.md` | 디자인 시스템 (토큰·타이포·컴포넌트) |
| `spec.md` | 제품 요구사항 (특히 §3.5 도메인, §7 화면 흐름) |
| `.claude/rules/multi-session.md` | FE/BE/BFF 협업 규칙 |
| `.claude/rules/pipeline.md` | Codex 파이프라인 + FE 섹션 |
| `.claude/rules/spec-dod.md` | DoD 해석 규칙 |
| `docs/IMPLEMENTATION_LOG.md` | 모든 작업 이력 (시작 시 먼저 읽기) |
| `docs/FE-ROADMAP.md` | FE 작업 로드맵 (다음 태스크 후보) |
| `pipeline/runs/IMPL-UI-XXX/FE-CODEX-HANDOFF.md` | 현재 태스크의 정답지 |

---

## 13. 연락 채널

- **GitHub PR 댓글** — 코드 관련 질문은 여기. 비동기 OK.
- **Slack/Discord (또는 카톡) #celebase-fe** — 빠른 질문, 동기 합의
- **#celebase-blockers** — 막혔을 때
- **shared-types 변경 알림** — BE 가 변경하면 즉시 알림 (반대도)

---

## 14. 이 문서를 에이전트에 던지는 법

새 Claude Code 세션 시작 시:

```
이 레포의 FE 작업을 시작합니다.

먼저 다음 문서를 모두 읽고 시작하세요:
1. /docs/ONBOARDING-FE.md   ← 너의 역할·정책·환경 셋업
2. /CLAUDE.md                ← 프로젝트 헌법
3. /DESIGN.md §0-§7.5        ← 디자인 시스템
4. /.claude/rules/multi-session.md
5. /.claude/rules/pipeline.md (FE 섹션만)
6. /docs/IMPLEMENTATION_LOG.md (최근 5개 entry)

그 다음 작업할 태스크: IMPL-UI-XXX
HANDOFF 문서 위치: /pipeline/runs/IMPL-UI-XXX/FE-CODEX-HANDOFF.md

작업 시작 전 §9 Pre-flight 체크 통과 여부를 보고하세요.
```

이 메시지 하나로 에이전트가 컨텍스트를 다 갖춘다.

---

> 이 문서는 살아있다. 빈 곳·잘못된 곳 발견 시 PR 환영. 작성자: BE 담당자 (`@<your-handle>`).
