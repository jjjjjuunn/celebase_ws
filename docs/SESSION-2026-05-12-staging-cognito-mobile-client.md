# 2026-05-12 세션 정리 — 모바일 출입증 발급 + 서버 반영

> 비전공자도 이해할 수 있도록 풀어 쓴 보고서.

## 1. 오늘 한 일을 한 줄로

**동료의 모바일 앱이 staging 환경의 로그인 시스템 (AWS Cognito) 과 연결되도록 "모바일 출입증" 발급 + 백엔드 서버에 반영 완료.**

PR 1개 (#69) 머지 + AWS staging 실제 적용 + 동료에게 출입증 정보 전달 + 동료의 M0~M4 mobile 작업 6개 pull + 안전성 검증.

---

## 2. 큰 그림 — 오늘 왜 막혔나

**문제 시나리오**: 동료 (Dohyun) 가 모바일 앱의 로그인 화면을 만들었는데 (PR #64 M1 Amplify), 화면을 켜도 "출입증 번호 (mobile client ID)" 를 모르는 상태였어요. 그 번호는 AWS Cognito 가 발급해줘야 하는데 — **설계도 (Terraform 코드) 만 있고 실제 발급 신청 (terraform apply) 을 안 한 상태**.

**비유**: 신입 사원이 입사했는데, 사원증 발급 신청서는 작성됐지만 인사팀에서 실제로 카드 만들지 않은 상태. 사원이 출입문 앞에서 들어가지 못함.

---

## 3. 오늘 처리한 4단계 작업

### 단계 1: AWS Cognito 에 모바일 출입증 발급

```bash
cd infra/cognito
terraform apply -var=environment=staging
```

- **신규**: `celebbase-mobile-staging` client 생성 → ID = `7m3snohc7f23nsk15vugh7i4ve`
- **회수**: 옛 테스트용 smoke client 삭제 (운영 영향 없음)
- AWS staging 의 User Pool `us-west-2_GvpQnHLEj` 에 즉시 반영

### 단계 2: 백엔드 서버 (user-service) 에 출입증 번호 등록

user-service 는 모바일 사용자 로그인 시 "이 사람의 토큰이 진짜 우리 모바일 앱이 발급한 게 맞나?" 를 검증해요. 그러려면 mobile client ID 를 환경변수로 알고 있어야 함.

- `services/user-service/.env.staging` (gitignored, 실제 운영 값) 에 `COGNITO_MOBILE_CLIENT_ID=7m3sno...` 추가
- `services/user-service/.env.staging.example` (committed, 신규 환경 셋업용 템플릿) 에도 placeholder 추가 → **PR #69 머지**

### 단계 3: staging 서버 재기동 (실제 새 환경변수 반영)

`apps/web` (Next.js BFF) 와 `services/user-service` 는 AWS EC2 인스턴스 (`celebase-staging`, IP `44.238.103.203`) 위에서 Docker Compose 로 실행 중.

| 자동 처리됨 | 수동 처리 필요 |
|------------|---------------|
| PR #69 머지 → GitHub Actions CD workflow 자동 trigger → Docker image 빌드 + ECR push + EC2 가 새 image 받아 컨테이너 재기동 | EC2 의 `/app/.env.staging` 파일은 git 에 추적 안 되므로 자동 갱신 안 됨 — 사용자가 EC2 에 SSH 접속 (AWS Console "EC2 인스턴스 연결") 후 직접 한 줄 추가 + 다시 한 번 `docker compose up --force-recreate user-service` |

### 단계 4: 동료 변경 pull + 안전성 검증

동료가 M0~M4 까지 무서운 속도로 6개 PR 머지 (#63 EAS → #68 PHI onboarding). 마지막 1단계 (M5 IAP + Inspired plan) 만 남음.

검증 항목 모두 통과:
- ✅ ownership 위반 0 (`apps/web/**`, `services/**`, `packages/ui-kit/**` 같은 JUNWON 영역 침범 0)
- ✅ `packages/shared-types` 변경 0
- ✅ `spec.md` +156 줄 (mobile M0~M4 명세, 정상)
- ✅ `pnpm turbo run lint typecheck` 28/28 PASS

### 단계 5: 동료에게 출입증 정보 전달

```env
EXPO_PUBLIC_COGNITO_USER_POOL_ID=us-west-2_GvpQnHLEj
EXPO_PUBLIC_COGNITO_MOBILE_CLIENT_ID=7m3snohc7f23nsk15vugh7i4ve
EXPO_PUBLIC_AWS_REGION=us-west-2
```

이 3줄을 동료의 `apps/mobile/.env` 에 채우면 모바일 로그인 흐름이 처음부터 끝까지 작동.

---

## 4. 비전공자 친화 개념 정리

### "왜 동료가 AWS 계정 없이도 Cognito 를 쓸 수 있나?"

**핵심**: Cognito 는 AWS 가 운영하는 **공공 서비스** (호스팅 SaaS). 인터넷에서 누구나 접근 가능한 endpoint URL (`https://cognito-idp.us-west-2.amazonaws.com/`) 을 가지고 있어요.

비유:
- Cognito User Pool = "공공 안내 데스크" (AWS 가 24시간 운영)
- BFF 출입증 = 회사 비밀번호 (`client_id` + `client_secret`, 둘 다 필요, 비밀)
- **모바일 출입증** = 일반 출입카드 번호 (`client_id` 만, **secret 없음** — 모바일 앱 코드가 App Store 에 공개되므로)

동료의 모바일 앱이 안내 데스크에 전화 거는 모습:
1. "저는 출입카드 `7m3sno...` 입니다"
2. "사용자 비밀번호는 SRP 프로토콜로 안전하게 전달" (Amplify SDK 가 처리)
3. 안내 데스크 확인 → `id_token` 발급
4. 모바일 앱이 `id_token` 을 BFF 에 보내 → user-service 가 검증 → internal JWT 발급 → SecureStore 저장
5. 이후 API 호출 시 internal JWT 사용

이 전체 과정에서 동료의 AWS 계정은 **단 한 번도 등장하지 않아요**. 출입카드 번호 + 안내 데스크 주소만 알면 끝.

### 자동 vs 수동 — 오늘 가장 헷갈렸던 지점

오늘 가장 핵심 학습: **"코드 변경 (git)" 과 "운영 환경의 비밀값 (.env)" 은 분리 관리됨**.

| 항목 | 변경 시점 | 누가 반영 |
|------|----------|----------|
| 코드 (예: TypeScript) | git push → main 머지 | GitHub Actions 가 자동 빌드/배포 |
| `.env.staging.example` (템플릿) | git commit 가능 | 자동 |
| **`.env.staging` (실제 비밀값)** | gitignored, 운영 서버에만 존재 | **사용자가 EC2 SSH 직접 수정** |
| AWS 인프라 (Cognito, S3 등) | Terraform 코드 변경 | `terraform apply` 수동 실행 |

오늘은 4개 모두 건드림: Terraform apply, 코드 변경 (PR #69), 자동 배포 (CD workflow), 수동 .env 수정 (EC2 SSH).

---

## 5. PR #69 변경 내용 (2 commits)

| 파일 | 변경 |
|------|------|
| `services/user-service/.env.staging.example` | `COGNITO_MOBILE_CLIENT_ID` placeholder 4줄 추가 |
| `docs/IMPLEMENTATION_LOG.md` | CHORE-STAGING-COGNITO-MOBILE-CLIENT-ID entry 34줄 |

---

## 6. 동료 M0~M4 진행 상황 (오늘 main 에 받아옴)

| PR | 단계 | 동료가 만든 것 |
|----|------|---------------|
| #63 | M0 EAS | EAS 빌드 설정, design-tokens RN 연동, jest+RTL, App.test.tsx |
| #64 | M1 Amplify | AWS Amplify v6, Cognito configure, SecureStore, Login/Signup screens, auth-refresh |
| #65 | M2 fetch | `authedFetch` + auto-login + 5-enum refresh state machine + logout |
| #66 | M3 Claims feed | ClaimsFeed/ClaimDetail screen, RN 컴포넌트들, url-allowlist |
| #67 | M4 onboard | Onboarding S2~S4 (Persona/BasicInfo/BodyMetrics, 비-PHI) |
| #68 | M4 PHI | Onboarding S5~S7 PHI (ActivityHealth/Goals/Reveal), bio-profile service, fail-closed POST |

**남은 단계**: M5 (IAP + Inspired plan). 모든 BE/BFF 의존성 main 에 이미 있음.

---

## 7. 다음 단계 — 누가 무엇을 할 수 있나

### 동료 Dohyun
- `apps/mobile/.env` 에 위 3줄 채우기 (이미 처리 가능성 높음 — M1 작업 중이라 staging Cognito 호출 셋업 했을 것)
- **M5 IAP + Inspired plan** 진입
- BE 의존성: RevenueCat webhook (#41), commerce internal endpoint (#52), BFF wrapper (#53), cache (#56), rate limit (#55) — 모두 main 에 있음

### JUNWON
- 동료가 새 BFF/BE 요청 시 대응
- 즉시 필요한 작업 없음
- 미래 backlog (동료 페이스 보고 결정):
  - CHORE-MOBILE-002 (refresh TTL 7-14d 단축, 보안 강화)
  - IMPL-MOBILE-PUSH-001 (FCM/APNs 푸시 알림)
  - spec.md 본문 web-first 표현 long-term absorption

---

## 8. 핵심 숫자

| 지표 | 값 |
|------|-----|
| 본 세션 머지된 PR | 1개 (#69) |
| 받아온 동료 PR | 6개 (#63~#68, M0~M4 완료) |
| 운영 변경 | terraform apply staging × 1, EC2 .env 수정 × 1, docker compose up × 1 |
| 안전성 검증 | 28/28 monorepo turbo PASS, ownership 위반 0 |
| 다음 mobile 단계 | M5 (Plan v5 의 마지막 단계) |

---

## 9. 한 줄 마무리

오늘로 **모바일 앱과 staging 백엔드 사이의 인증 연결 고리가 완성**됐고, 동료는 마지막 단계 (M5 결제 + Inspired plan) 만 남았습니다. JUNWON 측 즉시 작업 없이 동료 진행을 기다리는 상태.
