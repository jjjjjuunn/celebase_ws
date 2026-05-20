# apps/mobile — CelebBase Wellness Mobile

> Expo SDK 54 + React Native (New Architecture). PIVOT-MOBILE-2026-05 의 **active client**.
> Ownership: **JUNWON (단일 풀스택)** — `CLAUDE.md §1.1` (2026-05-20 단일 오너 전환).

이 앱은 더 이상 scaffold 가 아니다. 인증·온보딩·claim feed·meal plan·구독(IAP) 화면이 구현돼 있고,
모든 원격 호출은 `@celebbase/shared-types` Zod 스키마로 응답을 검증한다. 남은 작업은 대부분 **UI/네비게이션 와이어링**
(아래 `docs/FE-WIRING-TODO.md` 참조) — 백엔드/계약은 FE-readiness audit (2026-05-20) 으로 정렬됨.

---

## 0. 사전 요구사항

| 도구 | 용도 |
|------|------|
| Node ≥ 22 + pnpm 9 | 모노레포 |
| Docker Desktop | 로컬 BE 스택 (postgres/redis/localstack + 5 BE) |
| Xcode + CocoaPods (`brew install cocoapods`) | iOS dev build (인증/IAP 검증) |
| (선택) Android Studio + AVD | Android dev build |

**clone 경로에 공백/한글/특수문자 금지** — CocoaPods build script 가 첫 공백에서 truncate (`~/celebase/` 권장, `.claude/rules/multi-session.md §7.1`).

---

## 1. 풀스택 로컬 기동 순서 (FE 개발자 표준)

```bash
# 1) 의존성 + workspace 패키지 빌드 (루트에서)
pnpm install
pnpm --filter @celebbase/shared-types build
pnpm --filter @celebbase/design-tokens build

# 2) BE 스택 (postgres/redis/localstack + user/content/commerce/meal-plan/analytics)
docker compose up -d
pnpm db:seed        # 237 ingredients + 10 celebrities + 180 recipes + 50 lifestyle claims

# 3) BFF (Next.js) — 모바일의 게이트웨이. 포트 3100 사용 (3000 은 다른 dev server 와 충돌 가능)
pnpm --filter web dev -- --port 3100

# 4) 모바일 dev build (별 터미널, apps/mobile 에서)
cd apps/mobile
cp .env.example .env   # 값 채우기 — §2 참조
npx expo run:ios       # 첫 빌드 ~10분 (Pods), 이후 JS 변경은 hot reload
```

> **`pnpm start` (Expo Go) 는 인증/IAP 검증 불가** — `@aws-amplify/react-native` (Cognito SRP) 와
> `react-native-purchases` (RevenueCat) 는 native module 이라 Expo Go 에서 동적 로드 실패한다.
> UI 미리보기만 필요하면 `EXPO_PUBLIC_DEV_SKIP_AUTH=1` 로 cold-start 화면 확인 가능.
> 실제 로그인/결제 흐름은 **dev build (`npx expo run:ios`)** 필수 (`.claude/rules/multi-session.md §7.1`).

> **로컬 `/api/subscriptions/sync` 404 함정**: commerce-service 는 로컬에서 기본 `REVENUECAT_ENABLED=false` 라
> `/internal/subscriptions/refresh-from-revenuecat` 라우트가 미등록 → BFF sync 가 404 를 반환한다 (버그 아님).
> tier sync 를 로컬에서 실제로 돌리려면 mock RevenueCat + `REVENUECAT_ENABLED=true` 로 commerce 재기동 필요 —
> 절차는 `docs/IMPLEMENTATION_LOG.md` 의 `CHORE-TIER-SYNC-WIRE-VERIFY-001` 엔트리 참조. wire 경로 자체는 검증됨.

---

## 2. 환경 변수 (`apps/mobile/.env`)

`EXPO_PUBLIC_*` 접두사는 빌드 시 번들에 inline 된다.

| 변수 | 값 / 출처 |
|------|----------|
| `EXPO_PUBLIC_BFF_BASE_URL` | 로컬: `http://<Mac LAN IP>:3100` (시뮬레이터/실기기는 `localhost` 미도달 — `ipconfig getifaddr en0`). staging: `https://<staging-domain>` |
| `EXPO_PUBLIC_USER_SERVICE_URL` | `/auth/refresh` 직접 호출용 (BFF 우회 예외). 로컬: `http://<Mac LAN IP>:3001` |
| `EXPO_PUBLIC_COGNITO_USER_POOL_ID` | staging pool: `us-west-2_GvpQnHLEj` (Terraform `infra/cognito` output) |
| `EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID` | staging mobile client: `7m3snohc7f23nsk15vugh7i4ve` (secret 없음 / SRP-only) |
| `EXPO_PUBLIC_AWS_REGION` | `us-west-2` |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` | RevenueCat 대시보드 (G1 launch track 에서 발급 — 미발급 시 Paywall dev preview) |

---

## 3. 인증 흐름 (구현됨)

```
SignupScreen / LoginScreen
   │ Amplify SRP (Cognito)  → id_token
   ▼
POST /api/auth/mobile/{signup,login}  (BFF, Bearer 없음)  → { access_token, refresh_token }
   ▼ expo-secure-store 저장 (celebbase.auth.{access,refresh}_token)
authedFetch → Authorization: Bearer <access>  → 401 시 sharedRefresh()
   │  POST /auth/refresh  (user-service 직접 — BFF cookie-shaped 예외)
   ▼  5종 에러코드 분기: REFRESH_EXPIRED_OR_MISSING / TOKEN_REUSE_DETECTED / REFRESH_REVOKED / MALFORMED / ACCOUNT_DELETED
```

cold start: `bootstrapSession()` 가 SecureStore 토큰 존재만 확인 → 첫 API 호출이 refresh/logout 머신 트리거.

---

## 4. 현재 화면 (RootNavigator)

| 탭/스택 | 화면 | 상태 |
|---------|------|------|
| Auth | Login, Signup | 구현 완료 |
| Celebrities | CelebritiesGrid, CelebrityDetail, ClaimDetail | Grid 는 mock-data (실 `GET /api/celebrities` 미연결 — TODO) |
| Plan | MealPlan | day[0] 만 표시 (day-picker TODO) |
| News | NewsFeed | 100% mock (백엔드 endpoint 없음 — deferred) |
| SettingsTab | Settings | tier 표시 OK, email/계정삭제 와이어링 TODO |
| modal | Onboarding (6-step), Paywall | 구현 완료 (persona slug 저장 + RevenueCat) |

상세 와이어링 TODO + 백엔드 deferred 목록 → `docs/FE-WIRING-TODO.md`.

---

## 5. 스크립트

- `pnpm --filter mobile typecheck` — `tsc --noEmit`
- `pnpm --filter mobile lint` — `eslint --max-warnings=0`
- `pnpm --filter mobile test` — jest
- `npx expo run:ios` / `run:android` — dev build
- CI: `.github/workflows/mobile-ci.yml` (push/PR lint+typecheck+test)

## 6. 주의

- **service-core / ui-kit import 금지** — ESLint + Metro 가 차단. RN primitive (`View`/`Text`/`Pressable`) + `@celebbase/design-tokens` RN 익스포트만.
- shared-types 변경 시 `pnpm --filter @celebbase/shared-types build` 후 mobile typecheck.

## 참고
- `docs/FE-WIRING-TODO.md` — FE 와이어링 TODO + 백엔드 deferred 레지스트리 (FE-readiness audit 2026-05-20)
- `docs/MOBILE-ROADMAP.md` — track 인덱스
- `docs/PROD-DEPLOY-ROADMAP.md` — 4-Gate 출시 트랙
- `.claude/rules/multi-session.md §7.1` — dev build vs Expo Go
