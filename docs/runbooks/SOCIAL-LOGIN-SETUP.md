# Social Login (Apple / Google) — Setup Runbook (NATIVE)

> **Task**: IMPL-MOBILE-SOCIAL-NATIVE-001 · 작성 2026-05-20
>
> **방식 전환**: Cognito Hosted-UI federation → **네이티브 SDK 검증**. 이전 Hosted-UI 런북은 본 문서로 대체됨.
>
> **현재 상태**: 코드(BE + 모바일) **전부 구현 완료 + 로컬 검증(typecheck·lint·184 BE / 149 mobile unit) 통과 + 커밋됨**.
> 단, **Apple Developer / Google Cloud 자격증명이 없으면 실제로 켤 수 없다** — 그건 너의 계정으로만 발급 가능하다.
> 이 문서는 **네가 직접 해야 할 일만** 순서대로 정리한 것이다. 아래를 끝내면 네이티브 소셜 로그인이 켜진다.
>
> 자격증명을 주입하기 전까지 앱은 **기존 이메일/비밀번호(SRP) 로그인 그대로** 동작한다 (소셜 버튼 자동 숨김). 즉 지금 머지해도 안전하다.

---

## 0. 왜 바꿨나 + 아키텍처 한 줄 요약

**증상**: (1) Google 재로그인 시 `user.email: Attribute cannot be updated` 실패 — Cognito federation 이 매핑된 `email` 속성을 immutable pool 에 다시 쓰려다 터짐. (2) Apple/Google 모두 `amazoncognito.com` 웹 다이얼로그라 네이티브 느낌 없음.

**해결**: Cognito federation 을 인증 경로에서 제거. 모바일이 **네이티브 SDK** 로 provider id_token 을 받아 BE 가 **직접 검증**한다.

```
mobile (네이티브 시트/피커)
  ├─ Apple : expo-apple-authentication        → identityToken
  └─ Google: @react-native-google-signin      → idToken
        ↓ POST /api/auth/mobile/login { id_token, provider, email? }
  user-service 가 provider JWKS 로 직접 검증 (iss + aud strict + RS256 + exp)
        ↓
  internal { access_token, refresh_token }
```

- **email/password 는 그대로 Cognito SRP** 사용 (변경 없음). 네이티브 소셜만 Cognito 우회.
- provider `sub` 은 `apple:` / `google:` prefix 로 `users.cognito_sub` 컬럼에 저장 (스키마 변경 없음).
- 이메일 immutability 버그 **원천 제거** (Cognito 가 더 이상 소셜 email 을 쓰지 않음).

---

## ⚠️ 재테스트 순서 (이 순서 그대로 — 1번이 먼저)

> **순서를 어기면 "네이티브 전환이 더 안 되네"로 보인다.** 현재 staging BE 는 아직 옛 스키마(이 브랜치 미배포)라, mobile 만 새로 빌드해서 테스트하면 새 mobile 요청(`provider` 필드 / Apple 재로그인 email 생략)을 옛 BE 가 거부 → 400/401 혼란.

1. **BE 먼저**: 이 브랜치(`feat/IMPL-MOBILE-SOCIAL-001-apple-google-login`)를 **staging user-service 에 배포** + `APPLE_BUNDLE_ID` / `GOOGLE_CLIENT_IDS` env 주입 + 재시작 (§5).
2. Google iOS+Web client / Apple "Sign in with Apple" capability 발급 (§2~§3).
3. mobile `.env` 채우기 + `npx expo prebuild --clean && npx expo run:ios` (§4).
4. **옛 federated 테스트 계정 정리** (DB + Cognito) — §6.
5. 기기 E2E (§7).

> 2·3 은 병행 가능하지만 **1(BE 배포)은 mobile 테스트보다 반드시 먼저**.

---

## 1. 사전 조건

- [x] 모바일 dev build 환경 (Expo Go 아님 — 네이티브 모듈 필요). `npx expo run:ios` 또는 EAS dev build. (`.claude/rules/multi-session.md §7.1`.)
- [x] Apple Developer Program 멤버십 (유료, $99/yr) — Apple 로그인에 필수.
- [x] Google Cloud 프로젝트 1개 (무료).
- [x] staging user-service 배포 권한 (BE env 2개 주입 — §5).

### 확정값 (staging)

| 키 | 값 |
|----|----|
| App Bundle ID (iOS/Android) | `com.celebase.mobile` (브랜드 single-b) |
| App URL scheme | `celebase://` |
| BFF base URL (mobile → ) | `https://staging.celebase.app` |

> **네이티브 전환의 이득**: Hosted-UI 도메인 / Cognito IdP / Apple Services ID / Apple Key(.p8) / Cognito redirect URI — **전부 불필요**해졌다. 아래 §2~§3 만 하면 된다.

---

## 2. Google 설정 (Google Cloud Console) — client **2개**

> 결과물: **iOS client ID** + **Web client ID** + **iOS reversed client ID**. (Secret 불필요 — 클라이언트에 secret 안 둠.)

1. https://console.cloud.google.com → 프로젝트 선택(또는 생성).
2. **APIs & Services → OAuth consent screen**: External, 앱 이름·지원 이메일·로고 입력 후 게시. (테스트 단계면 test users 에 본인 계정 추가.)
3. **Credentials → Create Credentials → OAuth client ID** 를 **2번** 만든다:

   **(a) iOS 클라이언트** ⭐ 새로 생성
   - Application type: **iOS**
   - Bundle ID: `com.celebase.mobile`
   - 생성 후 **iOS URL scheme** (reversed client ID, 예: `com.googleusercontent.apps.123-abc`) 를 복사 → 모바일 `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`.
   - **Client ID** 도 복사 → 모바일 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

   **(b) Web 클라이언트**
   - Application type: **Web application**
   - Authorized redirect URIs / JavaScript origins: **비워도 됨** (네이티브 SDK 는 server-side code 교환 안 함 — Web client 는 idToken `aud` 발급 용도로만 쓴다).
   - **Client ID** 복사 → 모바일 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` **그리고** BE `GOOGLE_CLIENT_IDS`.

> **왜 Web client 가 BE 검증 대상인가**: `@react-native-google-signin` 은 `webClientId` 를 설정하면 idToken 의 `aud` 를 그 **Web client ID** 로 발급한다 (라이브러리/Google 공식 문서). 따라서 BE 는 **Web client ID** 를 allowlist 로 검증한다. iOS client 는 SDK 초기화 + reversed-scheme 리다이렉트 용도.

---

## 3. Apple 설정 (Apple Developer) — capability **1개만**

> 결과물: App ID `com.celebase.mobile` 에 **"Sign in with Apple" capability 활성화**. **그게 전부다.**
> (네이티브 방식은 Services ID / Key / .p8 / Return URL **전부 불필요** — Hosted-UI 때만 필요했음.)

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles → Identifiers → App IDs**.
2. `com.celebase.mobile` App ID 선택 (없으면 생성):
   - "Identifiers" 옆 **⊕(+)** → **App IDs** → Continue → type **App** → Continue.
   - Description `Celebase`, Bundle ID = **Explicit** `com.celebase.mobile`.
3. **Capabilities** 목록에서 **Sign In with Apple** 체크 → Save.
4. **Team ID** (우상단 10자리) 는 기록만 — env 에는 안 들어가지만 EAS 빌드 서명에 필요.

> aud 검증값은 **bundle ID `com.celebase.mobile`** 다 (Apple 네이티브 identityToken 의 `aud` = bundle ID). BE `APPLE_BUNDLE_ID` 에 그대로.

---

## 4. 모바일 환경변수 + 빌드

1. `apps/mobile/.env` (또는 EAS Secrets) — §2 에서 받은 값 채우기 (모두 PUBLIC, 시크릿 아님):
   ```
   EXPO_PUBLIC_SOCIAL_PROVIDERS=Google,Apple
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=123-ios.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=456-web.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.123-ios
   ```
   - 기존 `EXPO_PUBLIC_COGNITO_*`, `EXPO_PUBLIC_AWS_REGION`, `EXPO_PUBLIC_BFF_BASE_URL` 유지 (email/password SRP 용).
   - Apple 만: `EXPO_PUBLIC_SOCIAL_PROVIDERS=Apple` + Google 3줄 생략 → Apple 버튼만.
   - Google 3개 중 하나라도 비면 Google 버튼 자동 숨김 (의도된 안전장치).
2. **dev build 재생성 필수** (네이티브 모듈 + config plugin 추가 → 기존 build/Expo Go 안 됨):
   ```bash
   cd apps/mobile
   pnpm install                 # expo-apple-authentication + @react-native-google-signin 설치 (이미 package.json 반영됨)
   npx expo prebuild --clean    # config plugin 이 Info.plist URL scheme + Apple 엔타이틀먼트 주입
   npx expo run:ios             # 로컬 (Xcode 필요)
   # 또는
   eas build --profile development --platform ios
   ```
   - `app.config.js` 가 `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` 을 읽어 Google plugin 의 `iosUrlScheme` 으로 주입한다 (env 없으면 Apple plugin 만 → 그래도 빌드됨).
   - Apple 네이티브 시트는 **실기기 또는 properly-signed 시뮬레이터 빌드** 필요 (`usesAppleSignIn` 엔타이틀먼트). Expo Go 에서는 동작 안 함.

---

## 5. BE 환경변수 (staging user-service) — **필수**

> 이게 빠지면 `provider:'apple'/'google'` 요청이 **400 `SOCIAL_PROVIDER_NOT_CONFIGURED`** 로 fail-close 된다 (의도된 동작 — 조용히 통과 안 함).

staging user-service 배포에 아래 2개 env 주입 후 재배포:

```
APPLE_BUNDLE_ID=com.celebase.mobile
GOOGLE_CLIENT_IDS=456-web.apps.googleusercontent.com,123-ios.apps.googleusercontent.com
```

- `GOOGLE_CLIENT_IDS`: 쉼표 구분 allowlist. **Web client ID 는 필수** (idToken aud). iOS client ID 도 같이 넣어두면 라이브러리/버전 차이에 robust (둘 다 우리 소유라 안전). 각 값은 `.apps.googleusercontent.com` 으로 끝나야 함 (부팅 시 형식 검증 — 틀리면 기동 실패).
- `APPLE_BUNDLE_ID`: Apple identityToken 의 aud 검증값.
- 둘 다 `AUTH_PROVIDER=cognito` 와 독립. email/password 는 그대로 Cognito.
- 이 브랜치(`feat/IMPL-MOBILE-SOCIAL-001-apple-google-login`)를 staging 에 배포해야 BE 검증 코드가 올라간다.

---

## 6. 기존 테스트 계정 정리 — **재테스트 전 필수** ⚠️

> 이전 Hosted-UI 로 가입한 테스트 계정(Apple 성공분 + Google 부분가입분)은 `cognito_sub` 가 Cognito-federated 값(`Google_...` 등)이다. 네이티브 전환 후 같은 사람이 `apple:<sub>` / `google:<sub>` 로 오면 **동일 email + 다른 cognito_sub → 409 충돌**이 난다 (정상 동작 — auto-link 안 함). staging 테스트 데이터이므로 정리하면 됨.

**DB (user-service) — federated 행 삭제**:
```sql
-- 본인 테스트 이메일로 한정. 네이티브 prefix 행은 건드리지 않는다.
DELETE FROM users
WHERE email IN ('your-test-email@gmail.com', 'your-apple-test@icloud.com')
  AND cognito_sub NOT LIKE 'apple:%'
  AND cognito_sub NOT LIKE 'google:%';
```

**Cognito — 같은 사용자 삭제**: AWS Console → Cognito → User Pool `us-west-2_GvpQnHLEj` → Users → 해당 federated 사용자 삭제. (DB 만 지우고 Cognito 를 남기면 SRP 재가입 시 꼬일 수 있음 — 둘 다 정리.)

> email/password 로 만든 진짜 계정은 건드리지 말 것 (위 SQL 은 email allowlist 로 한정).

---

## 7. 테스트 체크리스트 (dev build 기기에서)

- [ ] **신규 Google**: "Continue with Google" → **네이티브 계정 피커** (웹 다이얼로그 아님) → 홈 진입. user-service 에 `cognito_sub='google:...'` 행 생성 확인.
- [ ] **Google 재로그인 (핵심 — 옛 버그)**: 로그아웃 후 같은 Google 계정 재로그인 → **성공** (이전 `Attribute cannot be updated` 재현 안 됨).
- [ ] **신규 Apple**: "Continue with Apple" → **네이티브 Apple 시트** → 홈 진입. `cognito_sub='apple:...'`.
- [ ] **Apple 재로그인**: 로그아웃 후 재로그인 → 성공 (email 없이도 sub 으로 매칭).
- [ ] **이메일 충돌**: email/password 가입 → 로그아웃 → 같은 이메일 Google → "This email is already registered with a different sign-in method..." (500/크래시 X). 서버 로그 `auth.account.provider_collision`.
- [ ] **사용자 취소**: 네이티브 시트/피커 dismiss → 에러 메시지 없이 로그인 화면 유지.
- [ ] **SRP 회귀**: 기존 이메일/비밀번호 로그인 정상.
- [ ] **provider 미설정 fail-close**: BE env(`APPLE_BUNDLE_ID`/`GOOGLE_CLIENT_IDS`) 안 넣고 소셜 시도 → 400 `SOCIAL_PROVIDER_NOT_CONFIGURED` (500 아님).

---

## 8. App Store / Play Store 심사 주의

- **Apple Guideline 4.8**: Google 소셜 로그인을 제공하므로 "Sign in with Apple" 도 제공해야 함 → 네이티브 Apple 시트로 충족 (이번 전환으로 Hosted-UI 때보다 심사 방어력 ↑).
- **Apple "Hide My Email"**: 사용자가 가리기 선택 시 `xxx@privaterelay.appleid.com` relay 주소가 식별자로 저장됨 — 정상.
- **Apple email 1회성**: Apple 은 **최초 동의 시에만** identityToken 에 email 을 넣는다. 재로그인 시 email 없어도 BE 가 `sub` 으로 사용자를 찾으므로 OK. 단 **계정 삭제 후 재가입** 시 Apple 이 email 을 안 주면 BE 가 `400 APPLE_EMAIL_REQUIRED` 로 안내 ("iOS 설정 → Apple ID → Apps 에서 Celebase 제거 후 재시도").
- **Google**: `@react-native-google-signin` 은 native 라 Expo Go 불가 — dev build 필수.

---

## 9. Terraform (Cognito Hosted-UI IdP) — 지금은 **건드리지 마라**

네이티브 전환으로 Cognito 의 Google/Apple IdP + mobile client 의 OAuth flow 설정은 **이제 미사용(vestigial)** 이다. 하지만:

- **그대로 둬도 무해**: SRP(email/password) 는 OAuth flow 설정과 무관하게 동작. 켜져 있어도 mobile 이 더 이상 호출 안 함.
- **지금 제거하지 않는 이유**: 제거 apply 는 별도 검증이 필요하고, 이번 PR 범위(코드 전환)와 분리하는 게 안전 (advisor 합의 — defer).
- **후속 정리**: 백로그 `CHORE-COGNITO-IDP-DEPRECATE-001` — IdP 리소스 + mobile client OAuth flow/callback 제거. (staging.auto.tfvars 의 google/apple 값 비우고 apply → IdP `count=0`.)

---

## 10. 끄기 / 롤백

- **앱에서만 끄기**: `EXPO_PUBLIC_SOCIAL_PROVIDERS` 제거(또는 Google 3개 env 제거) 후 재빌드 → 버튼 숨김, SRP-only.
- **BE 에서 끄기**: `APPLE_BUNDLE_ID` / `GOOGLE_CLIENT_IDS` env 제거 후 재배포 → 소셜 provider 미등록 → 400 fail-close.

---

## 11. 변경된 파일 (참고)

- **BE**: `packages/service-core/src/{errors.ts,index.ts}` (`SocialProviderNotConfiguredError` 400 + `AccountExistsError` 409), `services/user-service/src/services/social-auth.provider.ts` (신규 — Apple/Google verifier), `.../services/auth.service.ts` (Apple email guard), `.../routes/auth.routes.ts` (provider dispatch), `.../env.ts` (`APPLE_BUNDLE_ID`/`GOOGLE_CLIENT_IDS`), `.../lib/auth-log.ts`, `packages/shared-types/src/schemas/auth.ts` (`provider` discriminator + email optional) + 테스트.
- **Mobile**: `apps/mobile/app.config.js` (신규 — 네이티브 plugin), `src/services/social-auth.ts` (네이티브 호출), `src/lib/{social-config.ts,cognito.ts}`, `src/components/SocialAuthButtons.tsx`, `package.json`/`jest.setup.js`, `.env(.example)` + 테스트.
- **Spec**: `spec.md §11.1.1`.

---

## 12. 보안 검토 — self-adversarial pass (L3)

> "공격자가 이 코드로 무엇을 할 수 있나?" 신규 CRITICAL/HIGH 0. (Gemini CLI 도구 부재 → Claude self-adversarial, `.claude/rules/pipeline.md` IMPL-AI-002 패턴.)

| # | 위협 | 평가 |
|---|------|------|
| 1 | **위조 Google idToken** | `GoogleAuthProvider` 가 RS256(Google JWKS) + iss(두 표기) + **aud allowlist strict** + exp 검증. 다른 앱용 토큰은 aud 불일치로 거부. allowlist 는 우리 소유 client ID 만. |
| 2 | **위조 Apple identityToken** | `AppleAuthProvider` 가 RS256(Apple JWKS) + iss(`appleid.apple.com`) + **aud = bundle ID 단일** + exp. |
| 3 | **`provider` 필드 조작** | client 가 보내지만 신뢰 안 함 — 각 verifier 가 iss/aud/exp fail-close. 위조 provider 는 "어느 strict verifier 가 거부할지" 만 결정. cross-provider fallback 없음. |
| 4 | **미설정 provider 우회** | env 부재 시 provider 미등록 → `pickLoginProvider` 가 400 `SOCIAL_PROVIDER_NOT_CONFIGURED` throw. 조용한 통과/500 없음. |
| 5 | **빈 GOOGLE_CLIENT_IDS / 오타** | 부팅 시 형식 검증(`.apps.googleusercontent.com` 접미사) 실패 → 기동 거부. 빈 allowlist → provider 미등록(fail-close). |
| 6 | **이메일 enumeration (409)** | 공격자가 이미 그 이메일의 소셜 계정을 통제해야 도달. 임의 probing 불가. |
| 7 | **재방문 소셜 사용자 오탐 409** | `findByCognitoSub('apple:'/'google:'+sub)` 먼저 매칭 → 충돌 분기 미도달. 회귀 테스트 존재. |
| 8 | **Apple email 부재 → 빈 email INSERT** | lazy-provision 진입 전 `if(!email) throw 400 APPLE_EMAIL_REQUIRED` → `users.email NOT NULL` 위반/빈 행 방지. 테스트 존재. |
| 9 | **로그 PII 누출** | provider_collision 은 `hashId` 만 emit (Rule #8). token/raw email 미기록. |
| 10 | **시크릿 노출** | 클라이언트에 secret 없음 (Google client ID 는 public). Apple 은 .p8 자체가 불필요(네이티브). |

---

## 13. 네이밍 메모 — `celebase`(single-b) vs `celebbase`(double-b)

> 브랜드는 single-b **`celebase`**. 사용자/외부 노출 + 출시 후 영구 고정 식별자만 single-b 로 정리됨. 나머지 double-b 는 의도적 유지 (안 보이고, 바꾸면 위험만 큼).

| 항목 | 표기 | 왜 안 바꾸나 |
|------|------|--------------|
| `@celebbase/*` npm 스코프 | double-b | 비공개 workspace, 미게시. |
| JWT issuer `celebbase-user-service` | **double-b (위험)** | BFF/user-service/compose/shared-types lockstep — 어긋나면 401 cascade 무음 실패. |
| Cognito Hosted-UI 도메인 `celebbase-staging` | double-b | 이미 배포 + globally-unique. (네이티브 전환으로 이제 인증 경로에서 미사용.) |
| S3/DynamoDB terraform state | double-b | 배포된 state 백엔드. |
| Bundle ID / scheme / 표시이름 | **single-b** | App Store 영구 고정 + 사용자 노출. |
