# Social Login (Apple / Google) — Setup Runbook

> **Task**: IMPL-MOBILE-SOCIAL-001 · 작성 2026-05-20
>
> **현재 상태**: 코드 / 인프라(Terraform) / 모바일 UI **전부 구현 완료 + 로컬 검증(typecheck·lint·unit) 통과**.
> 단, **Apple Developer / Google Cloud 자격증명이 없으면 실제로 켤 수 없다** — 그건 너의 계정으로만 발급 가능하다.
> 이 문서는 **네가 직접 해야 할 일만** 순서대로 정리한 것이다. 아래를 끝내면 소셜 로그인이 켜진다.
>
> 자격증명을 주입하기 전까지 앱은 **기존 이메일/비밀번호(SRP) 로그인 그대로** 동작한다 (소셜 버튼 자동 숨김). 즉 지금 머지해도 안전하다.

---

## 0. 아키텍처 한 줄 요약

`mobile (Amplify signInWithRedirect)` → `Cognito Hosted UI` → `Google/Apple` → `Cognito 가 id_token 발급` → `BFF /api/auth/mobile/login` → `user-service 가 internal JWT 교환`.

- Cognito **Hosted UI 페더레이션** 방식 (네이티브 SDK / Identity Pool 아님). 기존 id_token 검증 경로를 그대로 재사용 → iOS·Android 동일 코드, 안정성 최대.
- Apple 도 Hosted UI 경유 (네이티브 "Sign in with Apple" 시트 아님). App Store 4.8 충족 — 단 §6 의 심사 주의 참고.

---

## 1. 사전 조건 (이미 되어 있어야 하는 것)

- [x] Cognito User Pool + Hosted UI 도메인 (`infra/cognito`, 이미 staging 에 배포됨).
- [x] 모바일 dev build 환경 (Expo Go 아님 — `@aws-amplify/rtn-web-browser` 네이티브 모듈 필요). `npx expo run:ios` 또는 EAS dev build. (`.claude/rules/multi-session.md §7.1` 참고.)
- [x] Apple Developer Program 멤버십 (유료, $99/yr) — Apple 로그인에 필수.
- [x] Google Cloud 프로젝트 1개 (무료).

### 확정값 (staging) — 아래 단계에서 그대로 복붙

> Terraform state 에서 확인한 **실제 배포 값**. 예시가 아니라 확정값이다 (`com.example.*` 등 다른 프로젝트 값과 헷갈리지 말 것). 철자 주의: `celebbase` = **b 두 개** (폴더명 `celebase` 와 다름).

| 키 | 값 |
|----|----|
| Hosted UI 도메인 | `celebbase-staging.auth.us-west-2.amazoncognito.com` |
| Region | `us-west-2` |
| User Pool ID | `us-west-2_GvpQnHLEj` |
| Cognito IdP response URL (Google/Apple 둘 다) | `https://celebbase-staging.auth.us-west-2.amazoncognito.com/oauth2/idpresponse` |
| App Bundle ID (iOS/Android) | `com.celebase.mobile` (브랜드 single-b) |
| App URL scheme | `celebase://` |

> 철자 두 갈래 주의: **앱/브랜드 식별자는 single-b `celebase`** (Bundle ID, scheme, 표시이름) / **Cognito Hosted-UI 도메인은 double-b `celebbase-staging`** (이미 배포된 별개 식별자 — 안 바꿈). 둘은 다른 시스템의 식별자라 일치할 필요 없음.

직접 재확인: `cd infra/cognito && terraform output hosted_ui_domain` 또는 AWS Console → Cognito → User Pool `us-west-2_GvpQnHLEj` → App integration → Domain.

---

## 2. Google 설정 (Google Cloud Console)

> 결과물: **Client ID** + **Client Secret** 2개.

1. https://console.cloud.google.com → 프로젝트 선택(또는 생성).
2. **APIs & Services → OAuth consent screen**: External, 앱 이름·지원 이메일·로고 입력 후 게시. (테스트 단계면 test users 에 본인 계정 추가.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application** (⚠️ "iOS"/"Android" 아님 — Cognito 가 server-side 로 code 교환하므로 Web client 필요).
   - **Authorized JavaScript origins**:
     ```
     https://celebbase-staging.auth.us-west-2.amazoncognito.com
     ```
   - **Authorized redirect URIs** (반드시 `/oauth2/idpresponse` 까지 전부 — `/oauth2` 에서 자르지 말 것):
     ```
     https://celebbase-staging.auth.us-west-2.amazoncognito.com/oauth2/idpresponse
     ```
   - 위 두 값은 staging 확정값이다 (위 "확정값" 표) — **그대로** 입력. **나중에 prod 배포 시** 도메인이 `celebbase-prod.auth.us-west-2.amazoncognito.com` 으로 바뀌므로, 그때 prod 용 Google client 를 **하나 더** 만든다 (지금은 불필요).
4. 생성된 **Client ID** 와 **Client Secret** 을 안전한 곳에 복사 (다음 단계 tfvars 에 사용).

---

## 3. Apple 설정 (Apple Developer)

> 결과물: **Services ID** + **Team ID** + **Key ID** + **.p8 Private Key** 4개.

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App IDs**: `com.celebase.mobile` App ID 에 **Sign In with Apple** 활성화. (브랜드 = single-b `celebase`.)
   - 목록에 `com.celebase.mobile` 이 **없으면 새로 만든다** (기존 `com.example.swimTrainingApp` 같은 다른 앱과 무관 — 별도 생성):
     - "Identifiers" 제목 옆 **파란 ⊕(+) 동그라미** 클릭 → **App IDs** 선택 → Continue → type **App** → Continue.
     - Description `Celebase`, Bundle ID = **Explicit** `com.celebase.mobile`.
     - **Capabilities** 목록에서 **Sign In with Apple** 체크 → Continue → Register.
   - (`apple_team_id` 는 developer.apple.com 우상단 이름 옆 10자리 — 예: `L8BU5UCBJA`.)
3. **Identifiers → ⊕(+) → Services IDs**: 새 Services ID 생성. 이게 OAuth `client_id` 가 된다.
   - Identifier 예: `com.celebase.mobile.signin` (App ID 와 달라야 함).
   - 생성 후 편집 → **Sign In with Apple → Configure**:
     - **Primary App ID**: `com.celebase.mobile`
     - **Domains and Subdomains**:
       ```
       celebbase-staging.auth.us-west-2.amazoncognito.com
       ```
     - **Return URLs**:
       ```
       https://celebbase-staging.auth.us-west-2.amazoncognito.com/oauth2/idpresponse
       ```
4. **Keys → (+)**: 새 Key 생성, **Sign In with Apple** 체크 → App ID 연결 → 생성.
   - **.p8 파일 다운로드** (⚠️ 1회만 다운로드 가능 — 잃어버리면 재발급). PEM 전체 내용을 tfvars 에 넣는다.
   - 이 Key 의 **Key ID** 기록.
5. **Team ID**: 우상단 멤버십 페이지의 10자리 Team ID 기록.

| Terraform 변수 | Apple 값 |
|----------------|----------|
| `apple_services_id` | Services ID identifier (예: `com.celebase.mobile.signin`) |
| `apple_team_id` | 10자리 Team ID |
| `apple_key_id` | .p8 Key 의 Key ID |
| `apple_private_key` | .p8 파일 전체 PEM 내용 (`-----BEGIN PRIVATE KEY-----` 포함) |

---

## 4. Terraform — IdP 자격증명 주입 + apply

> ⚠️ **자격증명을 절대 git 에 커밋하지 마라.** 아래 `.auto.tfvars` 는 `.gitignore` 대상이다 (`infra/cognito/.gitignore` 에 `*.tfvars` 가 없으면 추가).

1. `infra/cognito/staging.auto.tfvars` 생성 (gitignore 확인 후):
   ```hcl
   environment = "staging"

   google_oauth_client_id     = "xxxx.apps.googleusercontent.com"
   google_oauth_client_secret = "GOCSPX-xxxx"

   apple_services_id = "com.celebase.mobile.signin"
   apple_team_id     = "ABCDE12345"
   apple_key_id      = "XYZ123ABC"
   apple_private_key = <<-EOT
     -----BEGIN PRIVATE KEY-----
     MIGT...(p8 전체)...
     -----END PRIVATE KEY-----
   EOT
   ```
2. apply:
   ```bash
   cd infra/cognito
   terraform plan    # google/apple identity_provider 2개 추가 + mobile client 갱신 확인
   terraform apply
   ```
   - plan 에 `aws_cognito_identity_provider.google[0]`, `.apple[0]` 신규 + `aws_cognito_user_pool_client.mobile` 갱신(`supported_identity_providers = ["COGNITO","Google","SignInWithApple"]`, callback_urls 추가) 이 보여야 한다.
3. output 확인:
   ```bash
   terraform output hosted_ui_domain        # 모바일 env 에 넣을 값
   terraform output social_providers_enabled # ["COGNITO","Google","SignInWithApple"] 확인
   terraform output mobile_callback_urls     # ["celebase://callback/"] — 모바일과 lockstep
   ```

> 자격증명 일부만 채우면 그 provider 만 켜진다 (예: Google 만 채우면 Google 만). 빈 값이면 federation no-op.

---

## 5. 모바일 환경변수 + 빌드

> 결과물: dev build / TestFlight 빌드에 소셜 로그인 버튼 노출.

1. `apps/mobile/.env` (또는 EAS Secrets) 에 추가:
   ```
   EXPO_PUBLIC_COGNITO_HOSTED_UI_DOMAIN=celebbase-staging.auth.us-west-2.amazoncognito.com
   EXPO_PUBLIC_SOCIAL_PROVIDERS=Google,Apple
   ```
   - 기존 `EXPO_PUBLIC_COGNITO_USER_POOL_ID`, `EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID`, `EXPO_PUBLIC_AWS_REGION`, `EXPO_PUBLIC_BFF_BASE_URL` 은 그대로 유지.
   - **두 변수가 모두 있어야** 소셜 버튼이 뜬다. 하나라도 비면 SRP-only 로 동작 (의도된 안전장치).
   - Apple 만 켜려면 `EXPO_PUBLIC_SOCIAL_PROVIDERS=Apple`, Google 만이면 `Google`.
2. 의존성 설치 (이미 `package.json` 에 `@aws-amplify/rtn-web-browser` 추가됨):
   ```bash
   pnpm install
   ```
3. **dev build 재생성 필수** (네이티브 모듈 추가 + bundle ID/scheme 변경 → Expo Go / 기존 build 로는 안 됨):
   ```bash
   cd apps/mobile
   npx expo prebuild --clean   # ⚠️ bundle ID/scheme 가 바뀌었으니 기존 ios/android 재생성 (clean 필수)
   npx expo run:ios            # 로컬 (Xcode 필요)
   # 또는
   eas build --profile development --platform ios
   eas build --profile development --platform android
   ```
   - `app.json` 의 `"scheme": "celebase"` 로 리다이렉트 (`celebase://callback/`) 가 앱으로 돌아온다. prebuild 가 iOS Info.plist `CFBundleURLTypes` / Android intent-filter 를 자동 생성한다.
   - ⚠️ 이전에 `com.celebbase.mobile` 로 한 번이라도 `expo run:ios` 했다면, `apps/mobile/ios` (gitignore 대상) 가 옛 bundle ID 로 남아있다 → `--clean` 으로 반드시 재생성. 시뮬레이터/기기의 옛 앱도 삭제.

---

## 6. App Store / Play Store 심사 주의

- **Apple Guideline 4.8**: 타사 소셜 로그인(Google)을 제공하면 "Sign in with Apple" 도 제공해야 한다 → 본 구현이 Apple 을 함께 제공하므로 충족. **단** Hosted UI 는 네이티브 Apple 시트가 아니라 웹 리다이렉트라, 드물게 심사에서 네이티브 버튼을 요구할 수 있다. 반려 시 옵션: (a) 심사 노트로 Hosted UI federation 임을 설명, (b) iOS 만 네이티브 `expo-apple-authentication` 으로 후속 전환 (별도 task).
- **Apple "Hide My Email"**: 사용자가 이메일 가리기를 선택하면 `xxx@privaterelay.appleid.com` relay 주소가 영구 식별자로 저장된다. 이는 정상 동작 — 그 주소가 그 사용자의 이메일이다.
- **Apple email 1회성**: Apple 은 **최초 동의 시에만** email 을 반환한다. Cognito 가 immutable `email` 속성에 영속화하므로 재로그인 시에도 유지된다 (별도 처리 불필요). 만약 테스트 중 Apple 연결을 끊었다 다시 하려면, Apple ID 설정 → "Apps Using Apple ID" 에서 앱을 제거해야 email 이 다시 온다.
- **OAuth 리다이렉트 보안**: mobile client 는 `generate_secret=false` + PKCE 로 보호된다. custom scheme(`celebase://`) 은 이론상 동일 기기의 악성 앱이 가로챌 수 있으나 PKCE 가 code 교환을 막는다 (알려진 모바일 OAuth 위협 모델). prod 출시 전 인지만 하면 됨.

---

## 7. 테스트 체크리스트 (dev build 기기에서)

- [ ] **신규 Google 사용자**: "Continue with Google" → Google 동의 → 앱 복귀 → 홈 진입. user-service 에 user 행 생성 확인.
- [ ] **신규 Apple 사용자**: "Continue with Apple" → Apple 동의 → 앱 복귀 → 홈 진입.
- [ ] **이메일 충돌 (핵심)**: 먼저 이메일/비밀번호로 가입 → 로그아웃 → **같은 이메일** 의 Google 계정으로 "Continue with Google". → "This email is already registered with a different sign-in method..." 메시지가 떠야 한다 (500/크래시 X). 서버 로그에 `auth.account.provider_collision` 이벤트 확인.
- [ ] **사용자 취소**: Hosted UI 에서 취소/뒤로가기 → 에러 메시지 없이 로그인 화면 유지.
- [ ] **SRP 회귀**: 기존 이메일/비밀번호 로그인 정상 동작 (소셜 추가가 깨뜨리지 않았는지).
- [ ] **env 미설정 회귀**: 소셜 env 를 빼고 빌드 → 소셜 버튼이 사라지고 SRP 만 동작.

---

## 8. 끄기 / 롤백

- **앱에서만 끄기**: `EXPO_PUBLIC_SOCIAL_PROVIDERS` (또는 `EXPO_PUBLIC_COGNITO_HOSTED_UI_DOMAIN`) 제거 후 재빌드 → 버튼 숨김, SRP-only.
- **인프라까지 끄기**: `staging.auto.tfvars` 의 google/apple 값을 비우고 `terraform apply` → IdP 리소스 제거 (`count=0`), mobile client `supported_identity_providers` 가 `["COGNITO"]` 로 복귀.

---

## 9. 후속 과제 (이번 범위 밖, 백로그 후보)

| 항목 | 설명 |
|------|------|
| 계정 자동 연결 (PreSignUp Lambda) | 현재는 충돌 시 409 안내(no auto-link). 양쪽 `email_verified=true` 면 자동 링크하는 Lambda 트리거 — 보안 검토 후 별도 task. |
| iOS 네이티브 Apple 버튼 | App Store 4.8 방어력 강화가 필요하면 `expo-apple-authentication` 으로 iOS 만 전환. |
| 소셜 버튼 provider 로고 | 현재 텍스트-only 버튼. Apple/Google 브랜드 가이드 로고 에셋 추가. |
| `LoginRequestSchema` email optional | id_token 이 신뢰 루트이므로 wire 의 email 중복 제거 (계약 변경 — lockstep PR 필요). |
| Settings 화면 "소셜 계정 연결" | 충돌 안내 메시지가 가리키는 실제 연결 UI (PreSignUp Lambda 또는 별도 link API 선행 필요). |
| Cognito `email_verified` attribute_mapping | 현재 `attribute_mapping = { email = "email" }` 만 (email_verified 미매핑). 의도된 결정 — user-service 는 email_verified 를 검증하지 않고, Apple 은 `email_verified` 를 문자열 `"true"` 로 보내 Cognito(boolean 기대)와 타입 불일치로 federation 실패 가능 (알려진 함정). 향후 email_verified gating 이 필요하면 **Google 만** 매핑 (`email_verified = "email_verified"`) + Apple 은 별도 처리. |

---

## 10. 변경된 파일 (참고)

- **Infra**: `infra/cognito/{main.tf,variables.tf,outputs.tf}` — Google/Apple IdP (count-gated) + mobile client OAuth code flow + sensitive 변수.
- **BE**: `packages/service-core/src/{errors.ts,index.ts}` (`AccountExistsError` 409 + export), `services/user-service/src/services/auth.service.ts` (충돌 감지), `services/user-service/src/lib/auth-log.ts` (`ProviderCollisionFields` + `auth.account.provider_collision` 이벤트) + `services/user-service/tests/unit/auth.service.test.ts`.
- **Mobile**: `apps/mobile/app.json` (scheme), `package.json` (`@aws-amplify/rtn-web-browser`), `src/lib/{cognito.ts,social-config.ts}`, `src/services/social-auth.ts`, `src/lib/auth-events.ts`, `src/components/SocialAuthButtons.tsx`, `src/screens/{LoginScreen,SignupScreen}.tsx` + 테스트.
- **Spec**: `spec.md §11.1.1` (신규) + `§10 MVP`.

---

## 11. 보안 검토 — self-adversarial pass (L3)

> "공격자가 이 코드로 무엇을 할 수 있나?" 관점 점검. 신규 CRITICAL/HIGH 0. (Codex/Gemini CLI fallback — `.claude/rules/pipeline.md` IMPL-AI-002 패턴.)

| # | 위협 | 평가 |
|---|------|------|
| 1 | **위조 id_token 우회** | 소셜 경로도 `CognitoAuthProvider.verifyIdToken` (RS256 sig + JWKS + iss + aud 배열 + exp + `token_use==='id'`) 재사용 — 검증 약화 없음. wire 의 `email` 은 user-service 가 무시하고 **검증된 token 의 email** 만 사용 → 위조 body email 무력. |
| 2 | **409 통한 이메일 enumeration** | 409 는 공격자가 **이미 그 이메일의 소셜 계정을 통제**한 뒤에야 도달 (Cognito federation 통과 필요). 임의 이메일 존재 여부 probing 불가 — 인증된 본인에게만 "비밀번호 계정 있음" 노출. |
| 3 | **재방문 소셜 사용자 오탐 409** | `findByCognitoSub` 가 먼저 매칭 → 충돌 분기 미도달. 회귀 테스트 존재. |
| 4 | **동시 첫 로그인 race 오탐 409** | create null 후 sub 재조회가 winner row (동일 sub) 매칭 → `incumbent.cognito_sub !== payload.sub` 거짓 → 충돌 분기 미도달. 테스트 존재. |
| 5 | **Hub listener 누수/교차오염** | one-shot listener + `finally` cleanup + 3분 timeout. 버튼은 flight 중 disabled. user-cancel cleanup 테스트 존재. |
| 6 | **custom scheme 가로채기** | 동일 기기 악성 앱이 `celebase://` 가로채도 PKCE (`generate_secret=false` + code_verifier) 가 code 교환 차단. |
| 7 | **시크릿 노출** | mobile 에 client secret 없음 (`generate_secret=false`). Google/Apple secret 은 gitignored tfvars → Cognito 만 보유, 클라이언트 미전달. |
| 8 | **로그 PII 누출** | `auth.account.provider_collision` 은 `hashId(email/sub)` 만 emit (Rule #8), emit-before-throw 보장. token/raw email 미기록. |
| 9 | **email claim 부재 처리** | id_token 에 email 없으면 BFF 호출 **전에** throw + `amplifySignOut` → malformed 요청 미발생. |
| 10 | **비활성 시 공격면** | env/자격증명 부재 시 oauth config 미적용 + 버튼 숨김 → 소셜 경로 자체가 비활성, 추가 공격면 0 (dormant). |

---

## 12. 네이밍 메모 — `celebase`(single-b) vs `celebbase`(double-b)

> 브랜드는 single-b **`celebase`** 다. 코드에 번진 double-b `celebbase` 중 **사용자/외부 노출 + 출시 후 영구 고정되는 식별자만** single-b 로 정리했다 (IMPL-MOBILE-SOCIAL-001). 나머지 double-b 는 **의도적으로 유지** — 안 보이고, 바꾸면 위험만 크다. 향후 "celebbase 싹 정리" PR 이 아래를 **무심코 건드리지 않도록** 명시한다.

| 항목 | 표기 | 왜 안 바꾸나 |
|------|------|--------------|
| `@celebbase/*` npm 스코프 (183 파일) | double-b 유지 | 비공개 workspace, npm 미게시 — 사용자에게 안 보임. 바꾸면 전 import 갱신(순수 churn). |
| JWT issuer `celebbase-user-service` (48곳) | **double-b 유지 (위험)** | BFF / user-service / docker-compose(2) / `auth.service.ts` `DEFAULT_INTERNAL_ISSUER` / shared-types 가 **lockstep 일치**해야 함. 하나라도 어긋나면 **401 cascade 무음 인증 실패** (CLAUDE.md "JWT issuer 정렬" 교훈). 바꾸려면 위 전부 동시 변경 필수. |
| Cognito Hosted-UI 도메인 `celebbase-staging` | double-b 유지 | **이미 배포됨** + globally-unique. 바꾸려면 `aws_cognito_user_pool_domain` destroy/recreate(Hosted UI 다운타임) + prefix 전역 가용 확인 + Google/Apple redirect URI lockstep 갱신. |
| S3 `celebbase-terraform-state` / DynamoDB `celebbase-terraform-locks` | double-b 유지 | 배포된 state 백엔드 — 이름 변경 = state 마이그레이션. 내부, 안 보임. |
| Bundle ID / scheme / 표시이름 | **single-b 로 변경됨** | App Store 출시 후 영구 고정 + 사용자 노출 → 지금(출시 전) 정리. |

**prod 배포 시 free win**: prod Cognito 를 만들 때 `hosted_ui_prefix = "celebase"` 로 시작하면 prod 도메인이 처음부터 `celebase-prod.auth.us-west-2.amazoncognito.com` (single-b) 가 된다 — staging 의 오타를 물려받지 않는다. (staging 은 그대로 둔다.)

**로그인 중 도메인 노출이 신경 쓰이면**: Cognito custom domain (`auth.celebase.app` + ACM cert) 으로 Hosted-UI 도메인 자체를 브랜드화 가능 — 별도 인프라 task (지금 범위 밖).
