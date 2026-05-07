# CelebBase Mobile — Active Client Roadmap

> Replaces `docs/FE-ROADMAP.md` post-PIVOT-MOBILE-2026-05.
> 운영 sprint 분해는 Plan v5 (private). 본 문서는 **변경 결정·아키텍처·자산 매핑·트랙 ID 인덱스**만 다룬다.

| Version | Date | Author | Change |
|---|---|---|---|
| v0.1 | 2026-05-07 | JUNWON | PIVOT-MOBILE-2026-05 결정 + ownership + 자산 매핑 + 트랙 인덱스 |

---

## 1. Context — PIVOT-MOBILE-2026-05

2026-05-07 결정 (FE-ROADMAP archived 사유):

- 운영 채널을 web → **mobile (iOS + Android) 단독** 으로 전환
- App Store + Play Store 양쪽 출시 목표
- **단일 코드베이스 (Expo / React Native)** 채택 — native dual (Swift + Kotlin) 대비 ROI 우위 (인력 1명 → 양 플랫폼)
- `apps/web` 은 **frozen** — 자산 보존, 어드민·마케팅 재활용 후보. 새 기능 추가 X. (`apps/web/README.md` 참조)
- **Ownership**: Dohyun = FE-mobile 전담 / JUNWON = BE + 잔존 BFF + infra

이전 web-first 작업 자산 (plan-20/21 시리즈, IMPL-AI-003 transparency, IMPL-016 commerce 일부) 은 `origin/archive/*` 6 개 브랜치로 보존 — 모바일 재구현 시 UX·BE 계약 reference.

## 2. Active Client Architecture (Option A)

```
[Expo App (iOS/AOS)]
      │  Cognito SRP
      ▼
[Cognito] ─→ user-service (Cognito → internal JWT 교환)
      │  Authorization: Bearer <internal JWT>  (Secure Storage 저장)
      ▼
[BE 서비스 5개] ── 직접 호출 (BFF 우회)
```

근거:
- Cognito mobile public client (INFRA-MOBILE-001) 이미 완성
- user-service 의 Cognito → internal JWT 교환 흐름 존재 (`services/user-service/src/services/cognito-auth.provider.ts`)
- Next.js BFF 는 cookie 기반이라 모바일 (bearer token) 재사용 부적합
- 모바일 BFF 재구축은 cross-cutting 요구사항 (push 토큰 등록, 영수증 검증, device rate limit) 누적 시 점진 도입 — MVP 범위 X

`apps/web/src/app/api/**` 의 web BFF 라우트는 web frozen 상태로 유지하되 새 라우트 추가 금지.

## 3. Workspace 셋업 (다음 작업)

순서:
1. `apps/mobile/` 추가 — `npx create-expo-app` (TypeScript + expo-router)
2. pnpm workspace 등록 (`pnpm-workspace.yaml` 에 추가)
3. `@celebbase/shared-types` / `@celebbase/design-tokens` 의존성 연결 (`workspace:*`)
4. `packages/design-tokens` 에 RN 익스포트 빌드 타겟 추가 (`tokens.native.ts` — StyleSheet 호환 객체)
5. EAS 프로젝트 생성 (`eas init`) + Apple Developer / Google Play Console 인증서 발급
6. Cognito Amplify SDK 연결 (mobile public client ID 주입)
7. 첫 build sanity check — Expo Go 미리보기 → EAS preview build (iOS + Android)

상세 task 분해는 Plan v5.

## 4. Reused Assets (BE/공통)

| Asset | 재사용 방식 |
|-------|------------|
| `services/**` | URL 호출 (직접) — 변경 없이 재사용 |
| `packages/shared-types/**` | TS import 그대로 (`import { mealPlanSchema } from '@celebbase/shared-types'`) |
| `packages/design-tokens/**` | CSS 변수 (web frozen 용) + **RN 익스포트 빌드 타겟 추가** (`tokens.native.ts`) |
| `infra/cognito/**` | mobile public client (INFRA-MOBILE-001) 그대로 사용 |
| `db/migrations/**` | BE 서비스 schema 그대로 |

비재사용 (frozen):
- `apps/web/**` — Next.js SSR · React Server Components · CSS Modules. 모바일과 무관
- `packages/ui-kit/**` — web React + CSS Modules 컴포넌트, RN 호환 X. 모바일 컴포넌트는 `apps/mobile/src/components/**` 에서 RN primitive (`View` / `Text` / `Pressable`) 로 새로 구현

## 5. Track ID Index (in-flight + planned)

| Track | 상태 | 비고 |
|-------|------|------|
| INFRA-MOBILE-001 | ✅ merged (PR #35) | Cognito mobile public client (Terraform) |
| IMPL-MOBILE-AUTH-001 | planned (P0) | audience 배열 + client_id claim 검증 |
| IMPL-MOBILE-AUTH-002 | planned | refresh enum (legacy) |
| IMPL-MOBILE-AUTH-003 | planned (P0) | refresh code enum 5종 |
| IMPL-MOBILE-PAY-001b | ✅ merged (PR #39) | RevenueCat webhook |
| IMPL-MOBILE-SUB-SYNC-001 | ✅ merged (PR #41) | subscription sync |
| CHORE-MOBILE-002 | planned | refresh TTL 7-14d + device_tracking |
| CHORE-INFRA-007 | planned | gate-implement worktree-aware terraform validate |
| IMPL-MOBILE-CORE-* | TBD | lifestyle claim feed (mobile 진입 후 정의 — spec §7.2 PIVOT-2026-05 기반) |
| IMPL-MOBILE-WORKSPACE-001 | next | `apps/mobile` Expo scaffolding + EAS 셋업 |

상세 진행은 Plan v5 + `docs/IMPLEMENTATION_LOG.md`.

## 6. Out of Scope (이 문서 X)

- 화면 단위 sprint 분해 → Plan v5
- BE/infra 작업 → `CLAUDE.md` §1.1 (JUNWON 영역)
- 디자인 토큰 정의 → `docs/design/DESIGN.md` (frozen, 모바일도 동일 원천)
- web 유지보수 절차 → `apps/web/README.md`

## 7. Cross-references

- `CLAUDE.md` §1.1 Ownership
- `.claude/rules/multi-session.md` Session Topology
- `spec.md` — body frozen, top banner 우선
- `apps/web/README.md` — frozen 사유와 재활성화 조건
- `docs/FE-ROADMAP.md` — pre-pivot historical (archived)
- `origin/archive/*` 6 브랜치 — 이전 web-first 작업 보존
