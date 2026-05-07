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

## 2. Active Client Architecture (hybrid BFF)

```
[Expo App (iOS/AOS)]
      │  Cognito SRP (Amplify)
      ▼
[Cognito] ── id_token ──▶ [user-service] /auth/signup·/auth/login → internal access/refresh JWT
      │                          (refresh JWT → expo-secure-store)
      │
      │  Authorization: Bearer <internal access JWT>
      ▼
┌─────────────────────────────────────────────────────────┐
│ [Next.js BFF — apps/web/src/app/api/**]                 │
│  · createProtectedRoute: cookie + Bearer fallback       │
│  · authSource: 'cookie' | 'bearer' (mobile = bearer)    │
│  · cookie path: web 유지, bearer path: mobile 전용      │
└──────────────┬──────────────────────────────────────────┘
               ▼
        [BE 서비스 5개]
               ▲
               │ 예외 (direct, BFF 우회)
               │ — BFF /api/auth/refresh 가 cookie-shaped (JSON 미반환)
   POST /auth/refresh ── mobile → user-service 직접
```

채택 근거 (Plan v5 §Decisions line 29-30):
- BFF 는 web 시기에 이미 운영 안정화 (`createProtectedRoute`, CSRF 보호, BE URL 캡슐화). mobile 이 재사용 시 BE evolution 으로부터 격리됨.
- cookie path 는 web 호환 그대로 유지, bearer path 는 mobile 전용으로 분기 — CSRF 표면 자체가 분리 (cookie-vs-bearer 격리)
- public attack surface 를 단일 ingress (BFF) 로 유지 (vs 5+ BE 서비스 직노출). 솔로 운영자에게 변경 격리 이득.
- IMPL-MOBILE-SUB-SYNC-001 (PR #41 merged) 가 이미 BE internal endpoint 로 운영 중 — BFF SUB-SYNC-002 로 mobile gateway path 가 자연스럽게 닫힌다.
- 유일 예외: `/auth/refresh` 는 BFF 라우트가 cookie 만 set/clear (JSON refresh token 미반환) 이라 mobile bearer flow 에 부적합 → mobile 은 user-service 를 직접 호출 (Plan v5 §Decisions).

`apps/web/src/app/api/**` 의 web BFF 라우트는 mobile 의 active gateway — mobile-driven 신규 라우트 추가 OK (Plan v5 IMPL-MOBILE-BFF-001 / SUB-SYNC-002). web SSR pages (`apps/web/src/app/(app|auth|marketing|slice)/**`) + components (`apps/web/src/components/**`) 만 frozen.

향후 mobile cross-cutting 요구사항 (push 토큰 등록, 영수증 검증, device rate limit, sentry-expo enrichment 등) 누적 시 BFF 안 mobile-only namespace (`/api/mobile/**`) 또는 별도 `mobile-bff` Fastify 추출은 backlog.

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
| `services/**` | mobile → BFF → BE (hybrid). `/auth/refresh` 만 mobile → user-service 직접 |
| `apps/web/src/app/api/**` (BFF) | **active mobile gateway** — `createProtectedRoute` Bearer fallback path. mobile-driven 신규 라우트 추가 OK |
| `apps/web/src/lib/server/**` | BFF 내부 유틸 — mobile gateway 와 함께 active |
| `packages/shared-types/**` | TS import 그대로 (`import { mealPlanSchema } from '@celebbase/shared-types'`) |
| `packages/design-tokens/**` | CSS 변수 (web frozen 용) + **RN 익스포트 빌드 타겟 추가** (`tokens.native.ts`) |
| `infra/cognito/**` | mobile public client (INFRA-MOBILE-001) 그대로 사용 |
| `db/migrations/**` | BE 서비스 schema 그대로 |

비재사용 (frozen):
- `apps/web/src/app/(app|auth|marketing|slice)/**` — Next.js SSR pages / route groups. 모바일과 무관
- `apps/web/src/components/**` — web React + CSS Modules. RN 호환 X
- `packages/ui-kit/**` — web React + CSS Modules 컴포넌트, RN 호환 X. 모바일 컴포넌트는 `apps/mobile/src/components/**` 에서 RN primitive (`View` / `Text` / `Pressable`) 로 새로 구현

## 5. Track ID Index (in-flight + planned)

| Track | 상태 | 비고 |
|-------|------|------|
| INFRA-MOBILE-001 | ✅ merged (PR #35) | Cognito mobile public client (Terraform) |
| IMPL-MOBILE-AUTH-001 | planned (P0) | audience 배열 + client_id claim 검증 |
| IMPL-MOBILE-AUTH-002 | planned | mobile ingress 결정 (옵션 A 직노출 vs B BFF mobile 라우트) |
| IMPL-MOBILE-AUTH-003 | planned (P0) | refresh code enum 5종 |
| IMPL-MOBILE-PAY-001b | ✅ merged (PR #39) | RevenueCat webhook |
| IMPL-MOBILE-SUB-SYNC-001 | ✅ merged (PR #41) | commerce-service internal sync endpoint |
| IMPL-MOBILE-BFF-001 | planned | `createProtectedRoute` Bearer fallback (cookie + bearer 분기) |
| IMPL-MOBILE-SUB-SYNC-002 | planned | BFF route `POST /api/subscriptions/sync` (SUB-SYNC-001 짝) |
| CHORE-MOBILE-001 | planned | 루트 `eslint.config.mjs` `apps/mobile/**` overrides + `.github/workflows/mobile-ci.yml` |
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
