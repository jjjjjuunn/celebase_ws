# apps/mobile — CelebBase Wellness Mobile

> Expo SDK 54 + React Native — IMPL-MOBILE-WORKSPACE-001 minimal scaffold.
>
> 본 패키지는 PIVOT-MOBILE-2026-05 의 active client. ownership: **Dohyun (FE Mobile)** —
> 본 scaffold 는 동료 M0 본격 작업의 entry point. multi-session.md §1 owner table 참조.

---

## 빠른 실행 (Quickstart)

### 1. 의존성 설치 (모노레포 루트에서)

```bash
# 루트에서 한 번만
pnpm install
```

### 2. 환경 변수 셋업

```bash
cd apps/mobile
cp .env.example .env
# .env 파일 열어서 BFF URL / Cognito client ID 등 채우기
```

### 3. 개발 서버 시작

```bash
# apps/mobile 디렉토리에서
pnpm start

# 또는 모노레포 루트에서
pnpm --filter mobile start
```

Expo Dev Server 가 `http://localhost:8081` 에서 시작되고 QR 코드 출력.

### 4. 폰에서 보기 — 3가지 방법

| 방법 | 절차 |
|------|------|
| **A. Expo Go (가장 빠름)** | App Store / Play Store 에서 `Expo Go` 설치 → 같은 Wi-Fi 에서 QR 스캔 → 앱 즉시 실행 |
| **B. iOS 시뮬레이터 (Mac 전용)** | Xcode 설치 후 `pnpm ios` |
| **C. Android 에뮬레이터** | Android Studio + AVD 셋업 후 `pnpm android` |
| **D. 웹 브라우저** | `pnpm web` — react-native-web 으로 빠른 미리보기 |

> **localhost 가 안 보이면**: 시뮬레이터/Expo Go 가 macOS 의 localhost 에 접근 못 할 수 있음. `.env` 의 `EXPO_PUBLIC_BFF_BASE_URL` 을 macOS 의 LAN IP (예: `http://192.168.1.50:3000`) 로 변경.

---

## 현재 상태 (IMPL-MOBILE-WORKSPACE-001 시점)

- **화면**: Expo default `App.tsx` ("Open up App.tsx to start working on your app!")
- **monorepo 통합**: `metro.config.js` 가 workspace root + per-package `node_modules` 를 둘 다 검색
- **ESLint 가드**: `eslint.config.mjs` 의 `apps/mobile/**` override 가 `@celebbase/service-core` / `@celebbase/ui-kit` import 를 차단 (CHORE-MOBILE-001 / PR #47)
- **CI**: `.github/workflows/mobile-ci.yml` — push/PR 시 자동 lint/typecheck/test
- **scripts** (`package.json`):
  - `start` / `ios` / `android` / `web` — Expo dev server
  - `typecheck` — `tsc --noEmit`
  - `lint` — `eslint "**/*.{ts,tsx}" --max-warnings=0`
  - `test` — placeholder (동료 M0 에서 jest 셋업)

---

## Plan v5 §M0~M5 흐름 (동료 Dohyun 작업 영역)

| 단계 | 내용 |
|------|------|
| M0 Scaffold | EAS 설정, Metro `resolveRequest` throw 추가, jest 셋업, design-tokens RN 익스포트 연동 |
| M0.5 | Apple App Privacy / Google Play Data Safety 매핑 |
| M1 | 인증: Amplify SRP → BFF `/api/auth/mobile/{signup,login}` → SecureStore 토큰 저장 |
| M2 | API client + refresh 상태머신 (5종 enum: `REFRESH_EXPIRED_OR_MISSING` / `TOKEN_REUSE_DETECTED` / `REFRESH_REVOKED` / `MALFORMED` / `ACCOUNT_DELETED`) |
| M3 | Claim feed (셀러브리티 정보 화면) |
| M4 | Onboarding + bio-profile (PHI 입력) |
| M5 | RevenueCat IAP + Inspired plan, BFF `/api/subscriptions/sync` 호출 |

---

## 주의사항

- **service-core / ui-kit import 금지**: ESLint + Metro (M0 추가) 가 차단. RN 컴포넌트는 `apps/mobile/src/components/` 에 RN primitive 로 직접 구현. design system 은 `packages/design-tokens/` 의 RN 익스포트만 사용.
- **EAS 비용 정책**: 빌드 횟수 / 시뮬레이터 외 실기기 빌드 — 동료 M0 진입 시 결정.
- **multi-session.md §1**: 본 디렉토리 owner = Dohyun. JUNWON 은 scaffold 외 변경 시 Dohyun 합의 필수.

---

## 참고

- `docs/MOBILE-ROADMAP.md` — Plan v5 north-star
- `docs/SPEC-PIVOT-PLAN.md` — IMPL-MOBILE-* task ↔ spec.md 매핑
- `spec.md §11` — Project Structure / Mobile auth ingress / BFF subscription sync
