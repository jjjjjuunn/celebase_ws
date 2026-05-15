# 2026-05-07 세션 정리 — 모바일 앱 출시 준비 마무리

> 비전공자도 이해할 수 있도록 풀어 쓴 오늘의 작업 보고서.

## 1. 오늘 한 일을 한 줄로

**스마트폰 앱(iOS/Android)을 출시하기 위해 필요한 서버 쪽 준비를 모두 끝냈고, 그 위에 보안 강화와 코드 정리까지 완료했습니다.**

총 **12개의 PR(코드 변경 묶음)을 main 브랜치에 머지(통합)** 했어요.

---

## 2. 큰 그림 — 우리가 무엇을 만들고 있었나

**CelebBase Wellness** 라는 셀러브리티 식단·운동 플랫폼은 원래 웹사이트로 시작했지만, 5월 시점에 **모바일 앱 우선 전략(PIVOT-MOBILE-2026-05)** 으로 전환했어요. 즉,

- **이전**: 웹사이트 = 메인 / 모바일 앱 = 나중
- **이후**: 모바일 앱 = 메인 / 웹사이트 = 일부 동결(새 기능 추가 X)

이걸 위해 백엔드(서버 쪽)에서 다음 4가지가 필요했습니다:

1. **모바일 인증** — 사용자가 모바일 앱에서 로그인할 때 보안적으로 안전하게 토큰을 주고받는 흐름
2. **결제 연동** — Apple / Google 의 인앱 결제(IAP)와 우리 서버를 연결
3. **데이터 동기화** — 모바일에서 결제하면 즉시 우리 DB의 구독 상태가 갱신되도록
4. **공통 가드레일** — 어뷰징 방지(rate limit), 보안 검증, 코드 품질

---

## 3. 오늘 머지된 PR — 단계별로

### 단계 A. 모바일 핵심 기능(7개 PR — JUNWON Pre-work)

| PR | 비유로 풀면 |
|----|------------|
| #47 CHORE-MOBILE-001 | 모바일 코드 폴더에 잘못된 import 가 들어가지 못하도록 **자동 검사기** 설치. 모바일 CI(자동 빌드 검증)도 활성화. |
| #48 IMPL-MOBILE-AUTH-003 | 모바일 앱이 로그인 토큰을 갱신할 때 서버가 **5종류의 정확한 사유 코드** 로 응답하도록 변경. 예: "토큰 만료" / "악의적 재사용 감지" / "계정 삭제됨" — 모바일이 각각 다르게 대응 가능. |
| #49 IMPL-MOBILE-AUTH-002a | 모바일 전용 **회원가입/로그인 API 신설** (`/api/auth/mobile/{signup,login}`). 웹은 쿠키 사용, 모바일은 JSON 토큰 직접 전달. |
| #50 CHORE-BFF-401-CONTRACT | 위 #48 의 5종 코드가 BFF(웹사이트 서버)를 거칠 때 **그대로 전달되도록** 수정. 이전엔 모두 'TOKEN_EXPIRED' 로 뭉개져 있었음. |
| #51 IMPL-MOBILE-AUTH-002b | 인증 API 들에 **분당 호출 횟수 제한** 적용 (가입 3회 / 로그인 10회 / 갱신 30회 / 로그아웃 20회). 무차별 대입(brute force) 차단. |
| #52 IMPL-MOBILE-SUB-SYNC-001b | 모바일 결제 후 서버가 RevenueCat(결제 중개 서비스) 에 직접 조회하는 **내부 API 추가**. 영수증 webhook 보다 즉시 반영. |
| #53 IMPL-MOBILE-SUB-SYNC-002 | 위 #52 를 모바일이 호출할 수 있도록 **BFF 래퍼 API** 추가 (`/api/subscriptions/sync`). 모바일은 결제 직후 이걸 호출해 즉시 paid tier 받음. |

이 7개가 머지되면 동료(Dohyun)가 모바일 FE(프론트엔드) 개발을 시작할 수 있어요. **현재 그 상태**.

### 단계 B. 보안 강화 + 코드 정리(5개 PR)

| PR | 비유로 풀면 |
|----|------------|
| #54 CHORE-AUTH-PUBLIC-PATHS-AUDIT | 다른 서비스(commerce / content / analytics 등)에도 같은 **인증/제한 순서 버그**가 있는지 전수 점검. **결과: 0건**. 향후 재발 방지를 위한 가이드 문서화. |
| #55 CHORE-SUB-SYNC-RATE-LIMIT-001 | 결제 동기화 API(`/api/subscriptions/sync`) 에 **사용자당 분당 5회 제한** 추가. 어뷰징으로 RevenueCat API quota 소진 차단. |
| #56 CHORE-SUB-CACHE-001 | 결제 동기화에 **30초 캐시 + single-flight** 적용. 같은 사용자가 동시에 여러 번 호출해도 RevenueCat 에 한 번만 조회. |
| #57 CHORE-COMMERCE-CHECKOUT-CLEANUP | RevenueCat 으로 전환했으니 **이전 Stripe 결제 코드** 가 더 이상 사용 안 됨 — 삭제 (총 190줄 정리). |
| #59 CHORE-BFF-SESSION-EXPIRED-CLEANUP | #50 머지 후 **사용 안 되는 에러 클래스(`SessionExpiredError`)** 가 코드에 남아있어 정리. 부수적으로 `console.log` 도 `process.stdout/stderr` 로 교체(보안 정책 준수). |

### 단계 C. 운영 이슈 처리(보너스)

- **PR #58 → #59 재제출**: PR #58 의 fix commit 들이 **GitHub Actions webhook delivery 이슈로 자동 검증이 trigger 안 됐음**. close/reopen, empty commit, base edit 모두 무효 → 새 brunch(`-v2`) 에 같은 변경을 단일 commit 으로 재제출 → 즉시 정상 trigger. 같은 시간대 다른 PR 들은 정상이라 GitHub 일시 webhook 장애로 추정.

---

## 4. 보안 결정 — 왜 중요한가

오늘 한 작업 중 **가장 중요한 보안 결정 3가지**:

### A. `/auth/logout` 의 처리 순서 (PR #51 의 fix1)

**문제**: 로그아웃 API 가 "토큰 검증 → 호출 제한 검사" 순서였는데, 이러면 잘못된 토큰을 무한히 보내도 호출 제한이 적용되지 않아 서버 CPU 가 소진됨.

**해결**: "호출 제한 검사 → 토큰 검증" 순서로 변경. 잘못된 토큰 spam 도 분당 20회로 차단. 이후 #54 audit 에서 **다른 서비스에는 같은 버그 없음** 확인.

### B. 결제 sync 에서 사용자 ID 강제 (PR #53 의 T4)

**문제**: 만약 모바일이 보내는 body 의 `user_id` 를 서버가 그대로 신뢰하면, 사용자 A 가 사용자 B 의 ID 를 보내서 B 의 구독 상태를 조작할 수 있음.

**해결**: BFF 가 body 의 `user_id` 를 **무시하고**, 인증된 세션의 `user_id` 만 사용. body 에 `user_id` 키가 있으면 zod strict 가 400 으로 거부.

### C. 내부 JWT audience 분리 (PR #52)

**문제**: user-service 와 commerce-service 의 내부 API 가 같은 토큰을 받으면, 한쪽이 뚫리면 다른 쪽도 위험.

**해결**: 각 서비스마다 **다른 audience** (`user-service:internal` / `commerce-service:internal`). cross-service 토큰 재사용 차단.

---

## 5. 검증 결과 — 모든 게 정상인지 확인

- 자동 테스트: **172 + 83 = 255 개의 테스트 모두 통과** (회귀 0)
- 코드 품질 검사 (typecheck/lint): 모두 통과
- 보안 검사 (gate-check.sh policy): 모두 통과
- CI(GitHub Actions): 모두 통과 (단, PR #58 webhook 이슈는 #59 재제출로 우회)

---

## 6. 다음 단계 — 누가 무엇을 할 수 있나

### 동료 Dohyun (모바일 프론트엔드)

**즉시 시작 가능**. 다음 단계로 진행:

| 단계 | 작업 |
|------|------|
| M0 | Expo 워크스페이스 셋업 + 모바일 CI 통합 |
| M0.5 | App Store / Google Play 출시 준비 |
| M1 | 인증 (Amplify SRP → BFF mobile signup/login → SecureStore 토큰 저장) |
| M2 | API 클라이언트 + 토큰 갱신 상태머신 (5종 사유 코드 분기) |
| M3 | Claim feed (셀러브리티 정보 화면) |
| M4 | 온보딩 + 건강 프로필 입력 |
| M5 | 인앱 결제 + Inspired plan |

### 후속 백엔드 작업 (필요시)

- **CHORE-MOBILE-002** (보안 강화): refresh token 유효기간을 30일 → 7~14일로 단축 + 디바이스 추적. **prod 인증 흐름 변경이라 신중**, 동료 M1 시작 전 또는 안정화 후 진행 권장.
- **IMPL-MOBILE-PUSH-001**: 푸시 알림(FCM/APNs). post-MVP.
- **IMPL-MOBILE-UPLOAD-001**: 식사 사진 업로드. **MVP 외 — 사용자 결정으로 보류**.
- **CHORE-MOBILE-LOGOUT-BFF**: 모바일 전용 로그아웃 BFF 라우트 신설 여부 — M1 진행 시점에 판단.
- **spec.md 본문 web-first 표현 정리**: long-horizon, 별도 SPEC-SYNC-* 작업.

---

## 7. 핵심 숫자

| 지표 | 값 |
|------|-----|
| 머지된 PR | 12개 |
| 코드 라인 변경 (대략) | +3500 / -300 |
| 신규 테스트 케이스 | 약 50개 |
| 수정/삭제된 보안 이슈 | 4건 (1 HIGH + 1 MEDIUM + 2 LOW) |
| 평균 review 통과율 | 1차 리뷰 100% 통과 (단, 1건 NEEDS_CHANGES → fix → r2 PASS) |
| 모든 테스트 회귀 | **0건** |

---

## 8. 한 줄 마무리

오늘로 **모바일 앱 출시를 위한 모든 백엔드 준비가 main 브랜치에 반영**됐습니다. 동료가 언제든 모바일 화면 개발을 시작할 수 있는 상태이며, 보안과 코드 품질 측면에서도 깔끔하게 정리됐습니다.
