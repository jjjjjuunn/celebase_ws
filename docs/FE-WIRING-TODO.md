# FE-Wiring TODO + Backend Deferred Registry

> **FE-readiness audit 2026-05-20 (FEAT-FE-ENABLEMENT-001 + 선행 fix 들).**
> 목표: "UI 만 딱딱 고치면 될" 상태. 아래 §A 의 백엔드/계약은 라이브 E2E 로 검증 완료 (FE 가 와이어링하면 작동).
> §B 는 FE 개발자의 UI/네비게이션 작업, §C 는 의도적으로 미룬 백엔드 (현재 FE 블로커 아님).

이 audit 은 로컬 풀스택 (docker BE 5 + BFF :3100) 에 대해 **모바일이 호출하는 모든 BFF 엔드포인트를 실제로 구동**하여 수행됨.

---

## §A. 백엔드/계약 — 검증 완료 (FE 블로커 0)

모바일이 호출하는 엔드포인트 전부 라이브 200/계약 일치 확인:

| 엔드포인트 | 상태 | 비고 |
|-----------|------|------|
| `POST /api/auth/mobile/{signup,login}` | ✅ | Cognito id_token → internal JWT |
| `POST /auth/refresh` (user-service 직접) | ✅ | 5종 에러코드 enum |
| `GET /api/users/me` | ✅ | `{user}` envelope |
| `GET/POST /api/users/me/bio-profile` | ✅ | POST 전체 온보딩 payload (PHI 배열+secondary_goals+diet_type) → 201 + tdee/target 계산. GET 은 bio 없으면 404 |
| `PATCH /api/users/me` | ✅ **(FIX-USER-PATCH-PARAM-INDEX-001 PR #137)** | persona slug + display_name 저장. **이전엔 모든 PATCH 가 500** (updateUser SQL param off-by-one) — 수정됨 |
| `DELETE /api/users/me` | ✅ **(FEAT-FE-ENABLEMENT-001 PR #138)** | 신규 BFF 패스스루 → user-service soft-delete, 204. Apple 5.1.1(v) |
| `GET /api/claims/feed`, `/api/claims/:id` | ✅ **(claims seed PR #138)** | 이전엔 `lifestyle_claims=0` 으로 empty. 이제 50 claims + 81 sources seed |
| `GET /api/celebrities`, `/:slug`, `/:slug/claims`, `/:slug/diets` | ✅ | 10 celebrities seed |
| `GET /api/meal-plans`, `/:id` | ✅ | premium tier meal-plan 생성 E2E (CHORE-TIER-SYNC-WIRE-VERIFY-001) |
| `GET /api/subscriptions/me` | ✅ | `{tier}` |
| `POST /api/subscriptions/sync` | ✅ wire 검증 (PR #135) | 응답 스키마 shared-types 일원화 (PR #138). 로컬은 commerce `REVENUECAT_ENABLED=true` 필요 |

선행 세션 fix: daily-logs DATE→wire 500 (PR #130), bio-profile wrap 502 (PR #131), BFF validation `details` 전달 (PR #133).

---

## §B. FE-only 와이어링 TODO ("UI 고치기")

백엔드는 준비됨 — 아래는 mobile 코드(화면/네비/서비스)만의 작업.

| # | 항목 | 파일 | 작업 |
|---|------|------|------|
| B1 | **CelebritiesScreen mock 데이터** | `src/screens/CelebritiesScreen.tsx:29,115` | `getMockCelebritiesByGender` (`src/lib/mock-data.ts`) → 실 `GET /api/celebrities` (`services/celebrities.ts:listCelebrities` 이미 존재) |
| B2 | **ProfileScreen 도달 불가** | `src/navigation/ProfileNavigator.tsx` (orphan) | `MainTabsNavigator` 에 Profile 탭 마운트. 화면+API (`GET /api/users/me`) 는 완성됨 |
| B3 | **ClaimsFeedScreen 도달 불가** | `src/navigation/DiscoverNavigator.tsx` (orphan) | 탭에 마운트. 화면+API (`GET /api/claims/feed`) 완성됨 (이제 데이터 있음) |
| B4 | **persona slug 미저장** | `src/onboarding/PersonaSelectStep.tsx:4-5`, RevealStep | 온보딩 완료 시 `PATCH /api/users/me {preferred_celebrity_slug}` 호출 (엔드포인트 ✅ 준비됨) |
| B5 | **계정 삭제 placeholder** | `src/screens/SettingsScreen.tsx:9-11,78-84` | support-email alert → `DELETE /api/users/me` 호출 + 토큰 clear + logout (엔드포인트 ✅ 준비됨) |
| B6 | **Settings email 하드코딩** | `src/screens/SettingsScreen.tsx:102` | `"Not signed in"` → `GET /api/users/me` 의 email |
| B7 | **RevenueCat identify 미호출** | `src/lib/revenuecat.ts:67`, 로그인 흐름 | 로그인 성공 후 `identifyRevenueCatUser(userId)` 호출 (멀티 디바이스 구독 공유) |
| B8 | **MealPlan day-picker 없음** | `src/screens/MealPlanScreen.tsx:102` | `daily_plans[0]` 만 표시 → today 매칭 + day 선택 UI. meal detail drill-down |
| B9 | **subscriptions/sync 로컬 스키마** | (해결됨 PR #138) | shared-types `SyncSubscriptionResponseSchema` 로 이전 완료 |
| B10 | 탭 아이콘 emoji | `src/navigation/MainTabsNavigator.tsx:24-29` | SVG 아이콘 세트 (CHORE-MOBILE-TAB-ICONS-001) |
| B11 | Paywall legal URL 하드코딩 | `src/screens/PaywallScreen.tsx:51` | `celebbase.com` stub → 실 Privacy/Terms (CHORE-MOBILE-LEGAL-001 + PROD G2) |
| B12 | 미참조 nav 타입 정리 | `navigation/types.ts:34-35,68-75` | B2/B3 가 `{Discover,Profile}Navigator` 를 탭에 마운트한 뒤, 실제 쓰이는 param 타입만 남기고 미참조 타입 제거. **navigator 파일 자체는 삭제 아님 — B2/B3 의 마운트 대상**이다 |

---

## §C. 백엔드 deferred 레지스트리 (현재 FE 블로커 아님)

| 항목 | 상태 | trigger / 비고 |
|------|------|---------------|
| **News/trends 엔드포인트** | 없음 | NewsScreen 은 mock. content-service trend intelligence (spec.md §10 Phase 2). 런치 v1 에서 탭 숨김 or mock 유지 결정 |
| **전체 계정삭제 PHI-purge 파이프라인** | soft-delete 만 구현 | `DELETE /users/me` 는 `deleted_at` 만 설정 (login 차단). DEK 폐기 + 30일 grace batch + S3 삭제 (security.md §) 는 별도 백로그 `CHORE-ACCOUNT-DELETION-PURGE-001`. Apple 5.1.1 은 soft-delete 로 충족 |
| **lifestyle-claims `claims`→`items` envelope rename** | 의도적 보류 | `.claude/rules/api-conventions.md` 의 허용 예외. mobile consumer lockstep 시 opportunistic |
| **user-service `/internal/users/:id/tier` provider 테스트** | 라이브 검증됨, 회귀 테스트 부재 | 백로그 `CHORE-USER-SVC-INTERNAL-TIER-TEST-001` |
| **HS256 verify 경로 제거 (Phase 3)** | defer + 게이트 | `CHORE-AUTH-MIGRATION-STATUS-001` 의 4조건 (로컬 RS256 + FE SRP 로그인 등) |

---

## §D. 데이터/설정 노트

- **claims seed 가 이제 로드됨**: `pnpm db:seed` → `claimsLoader` (PR #138) 가 10 파일 → 50 claims + 81 sources (전부 published). idempotent (celebrity_id+headline).
- **로컬 sync E2E**: commerce 가 기본 `REVENUECAT_ENABLED=false` 라 `/api/subscriptions/sync` 가 404. 전체 검증은 mock RevenueCat + `REVENUECAT_ENABLED=true` 재기동 필요 (CHORE-TIER-SYNC-WIRE-VERIFY-001 절차 참조). wire 경로 자체는 PR #135 에서 검증됨.
- **Cognito mobile client**: SRP-only (password flow 없음, secret 없음) — 올바른 보안 posture. AWS CLI 로 토큰 mint 불가, real SRP 로그인은 FE dev build 로만 검증.
