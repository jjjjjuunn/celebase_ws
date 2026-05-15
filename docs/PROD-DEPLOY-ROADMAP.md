# PROD-DEPLOY-ROADMAP — Lean Launch Plan (Gate-based, D-Day 2026-06-18)

> v1 — 2026-05-14 작성. Codex r1 (27 findings) + Gemini r1 (12 findings) adversarial review 반영.
> CelebBase mobile-first B2C wellness 앱의 prod 출시 트랙 정형화.
> 사용자 의도: **5주 aggressive launch + 사용자 < 1000명까지 over-engineering 회피** (Y Combinator "do things that don't scale").

## Context

**왜 이 문서가 필요한가**:

본 codebase 는 PIVOT-MOBILE-2026-05 ~ staging BFF 까지 reactive ad-hoc 으로 발전. 운영 결함이 누적 발견되는 패턴 (어제 staging BFF 5 hotfix, 오늘 lazy provisioning Cognito-DB drift + migration 0010/0012 누락). strategic 로드맵 없이는 다음 chore 도 ad-hoc.

기존 문서 한계:
- `spec.md §10`: **product feature roadmap** (Phase 1~4). Infra/deploy 영역 아님
- `docs/MOBILE-ROADMAP.md`: `apps/mobile` 트랙 ID 인덱스. Backend infra 아님
- `docs/SPEC-PIVOT-PLAN.md`: process gate trigger 매핑
- Prod deploy 명시 로드맵 부재

본 문서 신설 = 향후 5주 모든 의사결정의 기준점.

**의도한 결과**:
- 출시 트랙을 **4 Gate** (Account/IAP, PHI/Privacy, Prod Infra, Store Review) 기반으로 정형화
- D-Day = 4 Gate 모두 통과 조건 (calendar 는 estimate)
- 운영 결함 패턴 (어제~오늘 발견) 의 prod 재발 차단
- 사용자 < 1000명 기준 lean defaults + 의식적 risk acceptance + promotion criteria

---

## Strategic Decisions (사용자 확정 2026-05-14)

| Decision | 답 | Rationale |
|----------|-----|----------|
| **A. PHI 정책** | **medical_conditions + medications launch 에서 제거** + post-BAA 후 도입 | allergies + activity_level + body metrics 만 유지 (비-PHI). AI meal plan 효과성 약간 ↓ 단 CCPA + GDPR Art.9 + Apple 5.1.3 risk 0. 사용자 > 1K + BAA 체결 후 도입 |
| **B. DB 위치** | **EC2 docker Postgres + S3 daily backup** | RDS 비용 회피 ($15~25/월). 단 **stop conditions framework 의식적 acceptance** — 도달 시 RDS 즉시 promotion |
| **C. Timeline** | **5주 (D-Day 2026-06-18)** | Codex sub-gate 분해 + Apple Dev 1주 + IAP 5d + App Privacy 3d 현실적 가정. App Store reject 1회 대응 여유 |
| **D. Plan 구조** | **Gate-based** (Codex CHALLENGE 권장) | 4 Gate acceptance + dependency 명시. Calendar 는 estimate. 1인 운영의 fluid 변동성 대응 |

**Decision A 의 추가 결정 사항**:
- selection-based UX 는 유지 (회원가입 시 "personalized" vs "trend-only") — Apple App Privacy 평가는 **전체 앱이 Health & Fitness** 가정으로 작성 (Codex + Gemini HIGH finding)
- personalized path = `allergies` + `body_metrics` (height/weight/age/sex/activity_level) 만 수집. medical_conditions + medications 는 launch v1 에서 미수집
- post-BAA 도입 시 mobile UI 추가 + bio_profile field 활성화

**Decision B 의 stop conditions (RDS 즉시 promotion)**:
- p99 API latency > 800ms (5분 평균)
- DB size > 5GB
- EC2 memory pressure > 80% (5분 평균)
- backup restore time > 30분
- unplanned downtime > 1시간 (한 번이라도 발생 시)
- 사용자 > 1000 또는 동시 접속 > 100

---

## Gate Structure (D-Day = 4 Gate 통과 조건)

```
[G1: Account & IAP Gate]   ─┐
  Apple Dev / Google Play   │
  RevenueCat live           │
  IAP product registration  │
  Sandbox + Restore         │  ── G3 와 병렬
                            │
[G2: PHI/Privacy Gate]      ┼─┐
  PHI 제거 (Decision A)     │ │
  Privacy Policy + ToS      │ │
  App Privacy mapping       │ │
  Sentry PHI redaction      │ │
  Selection-based UX        │ │
                            │ │
[G3: Prod Infra Gate]       ┼─┤
  prod EC2 + 도메인         │ │
  4 BE 배포 (CD expansion)  │ │
  Cognito prod pool         │ │
  DB backup + Migration auto│ │
  Sentry + Observability    │ │
                            │ │
                            ▼ ▼
                  [G4: Store Review Gate]
                    EAS prod build
                    Store metadata
                    Submission
                    Closed beta (10-20)
                    Review pass / reject 대응

                  ▼
                D-Day = 4 Gate 모두 ✅
                추정 calendar: 2026-06-18
```

**Critical path**: G1 (Apple Dev → IAP sandbox) 가 가장 길음. G2 + G3 는 G1 진행 중 병렬. G4 는 G1+G2+G3 완료 후.

---

## Gate G1 — Account & IAP Gate

> **Goal**: 결제 인프라 완전 동작 + Apple/Google Store 계정 활성. D-Day 의 longest pole.
> **Estimated calendar**: D-35 ~ D-14 (3주, Apple D&B 변동성 포함)

### G1 Tasks

| Task ID | 내용 | Owner | 시작 조건 |
|---------|------|-------|----------|
| **CHORE-APPLE-DEV-001** | Apple Developer Program 가입 — **개인 founder 계정 primary path** (D-U-N-S 회피). $99/년. 즉시 시작 | JUNWON | 즉시 (D-35) |
| **CHORE-GOOGLE-PLAY-001** | Google Play Console 가입 + $25 one-time. 병렬 | JUNWON | 즉시 (D-35) |
| **CHORE-SES-PROD-ACCESS-001** ⚠️ promoted to G1 | AWS SES production access 신청 (24~48h 승인) + verified sender domain (`celebase.app`). Cognito email 50/day → 50K/day | JUNWON | 즉시 (D-35) |
| **CHORE-APPLE-PAID-AGREEMENT-001** | Paid Applications Agreement + bank/tax info 입력 (며칠~1주 처리) | JUNWON | CHORE-APPLE-DEV-001 완료 후 |
| **CHORE-REVENUECAT-LIVE-001** (7 sub-gate) | RevenueCat live 활성화 (sub-gate 분해 — Codex HIGH) | JUNWON | CHORE-APPLE-PAID-AGREEMENT-001 + CHORE-GOOGLE-PLAY-001 후 |

### CHORE-REVENUECAT-LIVE-001 sub-gates (Codex HIGH 분해)

| Sub | 내용 |
|-----|------|
| G1-a | App Store Connect 에 IAP product 등록 (Premium / Elite — 2 SKU) |
| G1-b | Google Play Console 에 subscription product 등록 (2 SKU) |
| G1-c | RevenueCat 대시보드: products + offering + entitlements 매핑 |
| G1-d | `REVENUECAT_PRODUCT_TIER_MAP_JSON` 환경변수 commerce-service 에 주입 |
| G1-e | commerce-service webhook auth tested (`REVENUECAT_WEBHOOK_AUTH_TOKEN`) |
| G1-f | iOS sandbox purchase + Restore + Subscription sync E2E (TestFlight or simulator dev build) |
| G1-g | Android internal license test + Restore + Subscription sync E2E |

### G1 Acceptance

- [ ] Apple Developer Program 활성 + App Store Connect 접근
- [ ] Google Play Console 활성
- [ ] AWS SES production access 승인 (50K emails/day)
- [ ] Paid Applications Agreement 체결 (bank info + tax form)
- [ ] iOS + Android IAP product 4개 (Premium/Elite × 2 OS) 등록 + RevenueCat 매핑
- [ ] iOS sandbox purchase + Restore + Subscription sync E2E 통과
- [ ] Android internal license + Restore + Subscription sync E2E 통과
- [ ] commerce-service webhook auth 테스트 통과
- [ ] **Paywall dev preview price `$34.99` 제거** (Codex HIGH — `apps/mobile/src/screens/PaywallScreen.tsx:175-184`)
- [ ] **Tier labeling parity** — Premium vs Elite 구분 + exact product ID + benefit copy per tier (Codex HIGH — `PaywallScreen.tsx:188-208`)
- [ ] D-21 kill date — Apple Dev 가입 안 됐으면 personal account release 결정 또는 D-Day slip (Codex HIGH)

---

## Gate G2 — PHI/Privacy Gate

> **Goal**: PHI 처리 정책 launch v1 안전화 + 법적 의무 충족 + App Privacy review 통과 준비
> **Estimated calendar**: D-21 ~ D-7 (2주)

### G2 Tasks

| Task ID | 내용 | Owner | 일수 |
|---------|------|-------|------|
| **IMPL-PHI-LAUNCH-V1-REMOVAL-001** | `apps/mobile/src/onboarding/ActivityHealthStep.tsx` 에서 `medical_conditions` + `medications` field 제거. allergies + activity_level 만 유지. `services/user-service/src/services/bio-profile.service.ts` 의 해당 field 처리 코드 deprecation marker (post-BAA 부활) | Dohyun (mobile) + JUNWON (BE) | 2d |
| **IMPL-MOBILE-ONBOARDING-ROUTING-001** | 회원가입 후 selection 화면: (a) "personalized" → bio_profile (non-PHI v1) / (b) "trend-only" → ClaimsFeedScreen + ProfileScreen 에 "Start Personalization" 진입점 | Dohyun | 2d |
| **CHORE-LEGAL-001** | Privacy Policy + Terms of Service 작성 (1 페이지 markdown). 호스팅 = `apps/web` 의 `/privacy`, `/terms` 정적 route un-freeze (Codex MEDIUM) | JUNWON | 1.5d |
| **CHORE-APP-PRIVACY-MAPPING-001** | Apple App Privacy + Google Play Data Safety mapping. 전체 inventory table — PHI/non-PHI + 3rd party SDK (RevenueCat, Sentry, Cognito) + derived analytics + audit logs (Codex MEDIUM + Gemini HIGH) | JUNWON | **3d** |
| **CHORE-SENTRY-PHI-REDACTION-001** | `@sentry/react-native` + `@sentry/node` `beforeSend` PHI redaction (email, cognito_sub, bio_profile fields hash 만) (Codex LOW + Gemini MEDIUM) | JUNWON | 0.5d |
| **CHORE-COMPLIANCE-DECISION-RECORD-001** | `docs/runbooks/COMPLIANCE-LAUNCH-V1.md` 신설 (Codex HIGH + Gemini HIGH). 내용: (1) HIPAA 적용 여부 결정 (covered entity 아님), (2) FTC Health Breach Notification Rule 책임, (3) CCPA / GDPR 적용 사용자 처리, (4) vendor list (Cognito / RevenueCat / Sentry / Stripe), (5) breach response owner = JUNWON | JUNWON | 1d |

### G2 Acceptance

- [ ] `apps/mobile/src/onboarding/ActivityHealthStep.tsx` 에서 medical_conditions + medications 입력 field 0건 (grep 검증)
- [ ] `services/user-service/src/repositories/bio-profile.repository.ts` 의 두 field INSERT 코드 deprecation marker (post-BAA 부활 가능)
- [ ] DB schema 그대로 (drop 안 함 — post-BAA 복귀 위해)
- [ ] selection-based 회원가입 화면 동작 (2 path 분기 + 추후 진입점)
- [ ] `apps/web/` 의 `/privacy`, `/terms` route 정적 페이지 200
- [ ] App Privacy / Data Safety inventory table — 모든 data type 매핑 (RevenueCat, Sentry, Cognito 포함)
- [ ] Sentry `beforeSend` PHI redaction 적용 + sandbox event 로 검증
- [ ] `docs/runbooks/COMPLIANCE-LAUNCH-V1.md` 작성 + breach response owner 명시

---

## Gate G3 — Prod Infra Gate

> **Goal**: prod 환경 가동 + 모든 BE 서비스 배포 + 자동화 운영
> **Estimated calendar**: D-30 ~ D-10 (병렬 진행, G1 의 일부와 동시)

### G3 Tasks

| Task ID | 내용 | Owner | 일수 |
|---------|------|-------|------|
| **CHORE-STAGING-MIGRATION-PIPELINE-001** | CD pipeline 의 deploy step 직전 migration auto-apply (node-pg-migrate 또는 dbmate). 임시 가드: user-service startup column existence sanity check | JUNWON | 1d |
| **CHORE-STAGING-BE-DEPLOY-001** (7 sub-task — Codex HIGH 분해) | content/commerce/meal-plan-engine/analytics 4 서비스 staging 배포 | JUNWON | 6-8d |
| **CHORE-COGNITO-PROD-POOL-001** (4 sub-task — Codex HIGH 분해) | prod Cognito pool terraform apply | JUNWON | 1.5d |
| **CHORE-PROD-EC2-001** (sub-task 분해 — Codex HIGH) | prod EC2 별도 인스턴스 + 모든 서비스 배포 | JUNWON | 3d (2d → 3d 보정) |
| **CHORE-DB-BACKUP-001** | EC2 cron `pg_dump → S3` daily + retention 30d + restore test 1회 검증 (Decision B 의 stop condition `backup restore time > 30분` 측정) | JUNWON | 1d |
| **CHORE-OBSERVABILITY-001** | Sentry free tier 통합 + **credit card on file** (Gemini MEDIUM — 5K errors 초과 시 자동 upgrade). DSN env. errors only | JUNWON | 1d |
| **CHORE-CAPACITY-BUDGET-001** ⚠️ 신규 (Codex MEDIUM) | m5.large 의 container memory caps + Postgres volume sizing + swap policy + log rotation + load-test thresholds — Decision B 의 의식적 risk acceptance | JUNWON | 1d |

### CHORE-STAGING-BE-DEPLOY-001 sub-task (Codex HIGH 분해)

| Sub | 내용 |
|-----|------|
| G3a-1 | ECR repo 4개 신규 생성 (celebase-content-service, -commerce-service, -meal-plan-engine, -analytics-service) |
| G3a-2 | `.github/workflows/cd.yml` 의 `workflow_dispatch.inputs.service` 에 4개 추가 + paths filter 확장 |
| G3a-3 | `.github/workflows/cd.yml` 의 build-push job 에 4개 빌드 step 추가 |
| G3a-4 | staging EC2 `/app/docker-compose.yml` 에 4 서비스 블록 추가 + env 변수 셋업 |
| G3a-5 | meal-plan-engine 의 localstack:4566 SQS 의존성 — staging 에서 real SQS 또는 localstack 결정 |
| G3a-6 | analytics-service 의 Cognito env / commerce-service 의 Instacart env (mock=true) |
| G3a-7 | 각 서비스 healthcheck + BFF URL integration |

### CHORE-COGNITO-PROD-POOL-001 sub-task (Codex HIGH 분해)

| Sub | 내용 |
|-----|------|
| G3b-1 | `infra/cognito/main.tf:9` backend key `cognito/staging/...` → `cognito/prod/...` 분리 (tfvars 또는 별도 file) |
| G3b-2 | callback_urls / logout_urls placeholder 교체 (`celebase.app` apex) + localhost 보존 |
| G3b-3 | Hosted UI domain collision check (`celebbase-prod`) |
| G3b-4 | terraform output 전파: user_pool_id, mobile_client_id, BFF client_id+secret, issuer, jwks_uri → BFF env + mobile EAS profile (Codex MEDIUM) |

### CHORE-PROD-EC2-001 sub-task (Codex HIGH 분해 — 별도 pipeline/runbook)

| Sub | 내용 |
|-----|------|
| G3c-1 | prod EC2 instance + Elastic IP + Security Group |
| G3c-2 | Cloudflare DNS `celebase.app` apex A record |
| G3c-3 | prod secrets injection (Cognito prod / SES verified domain / RevenueCat live) — IAM role 또는 Secrets Manager |
| G3c-4 | prod docker-compose: 5 BE + web + caddy + db + redis 모두 배포 |
| G3c-5 | DB migration first-run (CHORE-STAGING-MIGRATION-PIPELINE-001 의 runner 사용) |
| G3c-6 | Caddy prod CA (LE staging-CA dry-run → prod-CA) |
| G3c-7 | rollback plan + previous image SHA capture (이미 staging 패턴 있음) |

### G3 Acceptance

- [ ] `curl https://celebase.app/api/health` 200
- [ ] 5 BE 서비스 + web + caddy 모두 prod 에서 healthy
- [ ] migration auto-runner 동작 (staging + prod 둘 다)
- [ ] DB daily backup → S3 + restore test 30분 이내 (Decision B stop condition baseline)
- [ ] Sentry error 수집 활성 + DSN + credit card on file
- [ ] Capacity budget worksheet 작성 + m5.large 의 stop conditions baseline 기록
- [ ] prod Cognito pool 활성 + mobile EAS prod profile 의 env 주입 완료

---

## Gate G4 — Store Review Gate

> **Goal**: 첫 빌드 제출 + closed beta + review 통과
> **Estimated calendar**: D-14 ~ D-Day

### G4 Tasks

| Task ID | 내용 | Owner | 일수 |
|---------|------|-------|------|
| **CHORE-EAS-OWNER-TRANSFER-001** | EAS owner `ryuben` 개인 → `celebbase` 조직 이전 (Apple Dev 가입 후 가능). bundle id 보존. EAS projectId 보존 | Dohyun | 0.5d |
| **CHORE-EAS-PROD-BUILD-001** | EAS `production` profile 검증 + iOS + Android 빌드 + App Store Connect / Google Play Console 업로드. **prod 환경변수 명시** (`EXPO_PUBLIC_COGNITO_USER_POOL_ID` prod / `EXPO_PUBLIC_BFF_BASE_URL=https://celebase.app` / `EXPO_PUBLIC_REVENUECAT_*_KEY` live) (Codex CHALLENGE + Gemini CHALLENGE) | Dohyun | 1.5d |
| **CHORE-STORE-METADATA-001** | App Store + Play Store 메타데이터: 스크린샷 5장 / 앱 설명 / 카테고리 Health & Fitness / 키워드 / **Health Data Use disclosure** (Gemini HIGH — 5.1.3) | Dohyun + JUNWON | 1.5d |
| **CHORE-TESTFLIGHT-BETA-001** | TestFlight invite 10~20명 + Play Internal closed track. **목적: sanity check + UX feedback** (bug discovery 아님 — Codex MEDIUM + Gemini MEDIUM) | JUNWON + Dohyun | 1d 셋업 + 5d 운영 |
| **CHORE-STORE-SUBMISSION-001** | 정식 submit | JUNWON + Dohyun | 1d |
| **CHORE-STORE-REVIEW-RESPONSE-001** | reject 시 수정 + 재제출. 1회 reject 대응 buffer | JUNWON + Dohyun | 2~5d (가변) |

### G4 Acceptance — Beta

- [ ] TestFlight 10~20 invite 발송 + Play Internal 동시
- [ ] Crash-free sessions > 99% (Codex MEDIUM)
- [ ] Signup 성공 (양 path)
- [ ] Personalized path 완료 (signup → onboarding → meal plan)
- [ ] Trend-only path 완료 (signup → claim feed)
- [ ] Sandbox purchase (Premium + Elite 각 1회) + Restore purchase
- [ ] iOS + Android 최소 각 1대 device 검증
- [ ] Feedback 채널 (Slack 또는 Notion) — qualitative UX feedback 수집

### G4 Acceptance — Store Review

- [ ] Beta 가 pre-review gate (Codex HIGH 결정) — beta 종료 후 submission. blocker 발견 시 fix → resubmit
- [ ] App Store + Play Store 정식 submit 완료
- [ ] Review pass (또는 1회 reject 후 fix + 재 submit)
- [ ] D-Day = 4 Gate 모두 ✅

---

## Risk Register (Codex + Gemini 통합)

| Risk | 확률 | 영향 | Mitigation |
|------|------|------|-----------|
| **Apple Developer D&B 검증 1-2주 지연** | 보통 (Gemini REGRESSION) | D-Day 1-2주 slip | **개인 founder 계정 primary** (business 회피). D-35 즉시 시작. **D-21 kill date** — 이 시점 미가입 시 personal account release 결정 또는 D-Day slip (Codex HIGH) |
| **App Store reject 5.1.3 Health & Medical** | 높음 | 1-2주 지연 | medical_conditions 제거 (Decision A) + 강한 Privacy Policy + Health Data Use 명시 + 데모 영상. 1회 reject buffer (Week 5) |
| **IAP sandbox 검증 실패** | 보통 | 3-5일 지연 | G1 sub-gate 7개 분해. iOS + Android 각 entrants — 둘 중 하나 실패해도 부분 launch 옵션 평가 |
| **Cognito email spike (launch day)** | 보통 (Codex MEDIUM) | 신규 사용자 가입 차단 | SES production access 승인 후 launch. 추가: signup cap/monitor 셋업 + Cognito email Quota 알림 |
| **EC2 single instance saturation** | 보통 (Gemini HIGH) | 운영 불안정 | Capacity budget worksheet (CHORE-CAPACITY-BUDGET-001) + stop conditions baseline. p99 > 800ms / memory > 80% / DB > 5GB 발생 시 RDS 즉시 promotion |
| **Migration runner DB lock 또는 rollback** | 낮음 | 0.5일 | dbmate 같이 검증된 도구. staging 다회 검증 후 prod 적용 |
| **TestFlight beta critical bug** | 보통 | 3-5일 지연 | beta = pre-review gate (Codex HIGH 결정). 1주 beta 운영 = bug fix budget |
| **EAS prod build native module 호환 실패** | 낮음 | 1-2일 | preview profile 미리 검증 (현재 working) |
| **수동 PHI onboarding 실패** ← HealthKit 에서 rename (Codex LOW) | 낮음 | 0.5일 | trend-only path 가 fallback. allergies + activity_level 만이라 입력 부담 ↓ |
| **PHI fail-closed audit log brittleness** | 낮음 (PHI 양 감소) | UX block | medical_conditions 제거 (Decision A) 로 audit 트리거 감소. 향후 chore `CHORE-PHI-AUDIT-RETRY-QUEUE-001` (post-launch) |
| **Sentry 5K errors 폭주** | 보통 (Gemini MEDIUM) | 모니터링 blind | credit card on file (자동 upgrade). 추가: monthly error budget check |
| **Cognito prod terraform backend key 충돌** | 낮음 (Codex MEDIUM) | 0.5일 | tfvars 분리 + lifecycle.precondition `var.environment != "prod"` (이미 staging 만 차단) |
| **Paywall dev preview price `$34.99` prod 배포** | 낮음 (Codex HIGH 발견) | App Store reject 또는 사용자 혼란 | G1 acceptance: dev preview 제거 검증 |
| **EAS owner transfer 시 TestFlight provisioning 문제** | 낮음 | 1일 | bundle id 보존 + projectId 보존. ryuben 개인 계정 fallback |

---

## Out of Scope

- **사용자 > 1000명 이후 작업** — ECS Fargate / RDS / multi-AZ / CloudWatch / Datadog / PagerDuty / HIPAA BAA. Promotion threshold 도달 시 검토
- **spec.md §10 Phase 2/3/4 product feature** — Instacart Connect, Push notifications, Trend Intelligence, Wearable, GLP-1 program. 출시 후 product roadmap
- **medical_conditions + medications 재도입** — post-BAA 후 `CHORE-PHI-MEDICAL-REINTRODUCE-001` 신규 chore
- **자체 백오피스 / 어드민 UI** — SQL 직접 + Cognito 콘솔 충분
- **마케팅 / SEO / Product Hunt** — 본 plan = 기술 출시. 마케팅 별도 결정
- **HealthKit / Google Fit 자동 동기화** — spec.md §10 Phase 2

---

## Track 2 — Post-Launch Incremental

### Promotion Rules — Operational metrics 기반 (Codex CHALLENGE)

| Threshold | Trigger 작업 | 근거 |
|-----------|-------------|------|
| **p99 API latency > 800ms (5분 평균)** | CHORE-INFRA-RDS-MIGRATION-001 | DB or app saturation |
| **DB size > 5GB** | CHORE-INFRA-RDS-MIGRATION-001 | docker Postgres volume limit |
| **EC2 memory pressure > 80% (5분)** | CHORE-INFRA-ECS-MIGRATION-001 또는 EC2 upgrade | resource contention |
| **Backup restore time > 30분** | CHORE-INFRA-RDS-MIGRATION-001 | RDS PITR 으로 회복 시간 ↓ |
| **Unplanned downtime > 1시간** | 즉시 RDS + ECS 검토 + 사후 분석 | SPOF 노출 |
| **사용자 > 1000명** | CHORE-INFRA-ECS-MIGRATION-001 | 안정성 buffer |
| **에러 발생 > 100/day** | CHORE-OBSERVABILITY-DATADOG-001 | Sentry free 한계 |
| **매출 > $5K/월** | CHORE-HIPAA-BAA-001 + medical_conditions 재도입 검토 | 사업적 정당화 |

### Soft Chores (deferred 기본)

| Task ID | 내용 | Promotion Trigger |
|---------|------|-------------------|
| CHORE-AUTH-401-MESSAGE-UNIFY-001 | "User not found" 통일 (timing leak 차단) | 보안 감사 or enumeration 시도 탐지 |
| CHORE-AUTH-LOG-HASH-PREFIX-EXTEND-001 | hashId 8→16 chars | 사용자 > 50K |
| CHORE-AUTH-IS-NEW-USER-FLAG | LoginResponse.is_new_user | onboarding completion rate < 50% |
| CHORE-USER-SERVICE-HEALTHCHECK-001 | healthcheck + service_healthy | 부팅 race 발견 시 |
| CHORE-CD-SSH-KEY-TRAP-001 / KNOWN-HOSTS-001 | SSH 보안 강화 | 보안 침해 시도 탐지 |
| CHORE-CD-ROLLBACK-ALERTING-001 | rollback 발생 시 Slack 알림 | rollback 첫 발생 시 즉시 |
| CHORE-CD-BUILDX-DIGEST-001 | buildx imagetools digest | 보안 감사 |
| CHORE-CADDY-LE-EMAIL-001 | LE 만료 알림 | cert 만료 30일 전 알림 |
| CHORE-PHI-AUDIT-RETRY-QUEUE-001 ← 신규 (Gemini MEDIUM) | PHI audit log retry queue (fail-closed brittleness) | medical_conditions 재도입 시 |
| CHORE-PHI-MEDICAL-REINTRODUCE-001 ← 신규 | medical_conditions + medications 재도입 + BAA 후 | 사용자 > 1K + BAA 체결 |
| CHORE-STAGING-SEED-AUTOMATION-001 | seed-demo-all.sh 확장 | staging 재 셋업 필요 시 |

### Spec.md scalability target deviation 명시 (Codex MEDIUM)

`spec.md §9.2` 의 50K MAU + ECS Fargate + read replica + PgBouncer 는 본 plan 의 **temporary deviation**. 본 plan 의 promotion criteria (위 표) 도달 시 spec.md 의 target 으로 migration.

---

## Implementation Strategy

본 plan 의 첫 commit 은 **본 문서 자체** + spec.md §10A + IMPLEMENTATION_LOG entry. 그 이후 각 task 는 별도 chore / IMPL PR 로 진행.

**작업 순서** (본 plan 머지 후):
1. **G1 critical path 즉시 시작 (D-35)**:
   - CHORE-APPLE-DEV-001 (사용자 manual, D-35 즉시)
   - CHORE-GOOGLE-PLAY-001 (사용자 manual, D-35 즉시)
   - CHORE-SES-PROD-ACCESS-001 (사용자 manual, D-35 즉시)
2. **G3 병렬 시작**:
   - CHORE-STAGING-MIGRATION-PIPELINE-001 (JUNWON, 1d)
   - CHORE-STAGING-BE-DEPLOY-001 sub-task 1~4 (JUNWON, 4d)

각 chore 는 별도 PR + plan mode (큰 chore 만) + L1~L3 review tier 그대로.

---

## Acceptance Criteria (D-Day 출시)

- [ ] G1 ✅ — Apple Dev + Google Play + RevenueCat live + IAP sandbox 통과 + Paywall price/label parity
- [ ] G2 ✅ — medical_conditions/medications 제거 + selection-based UX + Privacy Policy/ToS URL + App Privacy mapping + Sentry PHI redaction + Compliance decision record
- [ ] G3 ✅ — prod EC2 + 5 BE 배포 + Cognito prod pool + migration auto-runner + DB backup + Sentry + Capacity baseline
- [ ] G4 ✅ — EAS prod build + Store submit + Beta acceptance + Review pass
- [ ] `https://celebase.app` 200 + iOS/Android 앱 다운로드 가능
- [ ] 첫 사용자 가입 → 선택 (personalized / trend-only) → 각 path 동작
- [ ] IAP 결제 sandbox 1회 + Restore + Subscription sync 통과
- [ ] DB daily backup → S3 자동 (restore test 30분 이내)
- [ ] Sentry error 수집 활성 + PHI redaction
- [ ] App Store / Play Store 정식 출시 + 첫 download

---

## Cross-references

- `spec.md` §10 (Phase 1) — 본 plan 의 product feature 의존성. M5 IAP 만 남음
- `spec.md` §8 (Subscription Tiers) — 가격 결정 ($14.99 / $29.99)
- `spec.md` §9.3 (Security / PHI) — PHI 처리 의무 + 감사 로그 fail-closed
- `spec.md` §10A (Lean Launch Plan) — 본 plan summary
- `spec.md` §11.1 (Cognito Identity Resources) — staging → prod pool 분리
- `spec.md` §9.2 (Scalability) — Track 2 promotion target
- `docs/MOBILE-ROADMAP.md` §5 — M0~M5 진행 상태 (M5 IAP only remaining)
- `docs/IMPLEMENTATION_LOG.md` — 과거 작업 추적 + 본 plan 진행 entry
- `docs/runbooks/COMPLIANCE-LAUNCH-V1.md` — compliance decision record (G2 시점 신설)
- `.claude/rules/multi-session.md` §1 — JUNWON (BE/infra) + Dohyun (mobile FE) ownership
- `.claude/rules/pipeline.md` — 각 sub-chore 의 review tier 적용
- `.claude/rules/spec-dod.md` — MOBILE-PIVOT spec sync 의무
- 어제 staging BFF chore (`CHORE-MOBILE-STAGING-BFF-001`) — lean defaults 검증된 패턴
- 오늘 lazy provisioning (`IMPL-AUTH-LAZY-PROVISION-001`) — Cognito-DB drift 안전망 (prod 도 적용됨)
- Plan adversarial review log:
  - Codex r1: 27 findings (REGRESSION 2 / HIGH 11 / MEDIUM 8 / LOW 2 / PASS 4 / CHALLENGE 2)
  - Gemini r1: 12 findings (REGRESSION 2 / HIGH 5 / MEDIUM 4 / CHALLENGE 1)
  - Disposition: 26 applied / 2 deferred / 1 rejected (Codex REGRESSION 1 — hallucination)
