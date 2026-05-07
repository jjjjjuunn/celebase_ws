# SPEC-PIVOT-PLAN — IMPL-MOBILE-* ↔ spec.md 트리거 레지스트리

> spec.md 본문은 PIVOT-MOBILE-2026-05 이전 web-first 시점에 작성됐다. 상단 PIVOT BANNER 가 본문보다 우선 (override) 하지만, 본문 자체를 수정하지 않으면 신규 세션이 web-first 가정을 그대로 답습할 위험이 있다.
>
> 본 문서는 **각 IMPL-MOBILE-* / INFRA-MOBILE-* / CHORE-MOBILE-* task 가 finalize 단계에서 갱신해야 할 spec.md 섹션 매핑** 을 트리거 레지스트리 형태로 고정한다. `.claude/rules/spec-dod.md` § "MOBILE PIVOT spec sync 의무" 가 본 레지스트리 인용을 강제하고, `scripts/gate-check.sh spec_sync` 가 PR 머지 전 자동 검증한다.

| Version | Date | Author | Change |
|---|---|---|---|
| v0.1 | 2026-05-07 | JUNWON | 초안 — Plan v5 Pre-work A/B/C + Mobile scaffold + M0~M5 항목 매핑 |

---

## 1. 운영 원칙

1. **incremental Option C**: spec.md 본문을 한 번에 재작성하지 않는다. 각 IMPL-MOBILE-* task 가 자기 영역의 spec.md 섹션을 patch 한다 (필드 추가, flow 다이어그램 갱신, DDL drift 정합 등).
2. **finalize 단계 의무**: 각 task 의 `pipeline.sh finalize` 또는 직접 PR 의 마지막 commit 에 `spec.md` 패치 또는 deferral marker 가 포함되어야 한다.
3. **deferral marker**: spec 변경이 본 task 범위에서 비합리적으로 큰 경우 `pipeline/runs/<TASK-ID>/SPEC-SYNC-DEFER.md` 에 사유 + 후속 SPEC-SYNC-* task ID 기록 후 통과시킨다.
4. **PIVOT BANNER 우선 (변경 X)**: spec.md 상단 banner (line 3-9) 가 본문과 충돌 시 banner 가 이긴다. 본 레지스트리는 banner 를 본문에 흡수해 가는 작업이지 banner 를 약화시키지 않는다.

## 2. 트리거 레지스트리 (Pre-work — JUNWON 직접 deliverable)

> Plan v5 Session A / B / C 매핑. Affected spec sections 는 검토 후 보강 가능 — 최소 명시 의무 영역만 기록.

### Session A — INFRA

| Task ID | 상태 | spec.md 갱신 의무 섹션 | Sync 트리거 |
|---------|------|------------------------|-------------|
| INFRA-MOBILE-001 | ✅ merged (PR #35) | §11 Project Structure (Cognito mobile public client output), §6 Security (auth flow — id_token 발급 client 종류) | 머지된 task 도 retroactive sync 대상 — 본 PIVOT-PLAN 신설 시점 backfill 1회 필요 (`SPEC-SYNC-INFRA-001` 신규 task 분리) |

### Session B — BE Service + DB

| Task ID | 상태 | spec.md 갱신 의무 섹션 | Sync 트리거 |
|---------|------|------------------------|-------------|
| IMPL-MOBILE-AUTH-001 | ✅ merged (PR #36) | §4.2 Auth (audience 배열 검증), Appendix A env (`COGNITO_MOBILE_CLIENT_ID`) | ✅ `SPEC-SYNC-AUTH-001` 완료 — §3 행 참조 |
| IMPL-MOBILE-AUTH-002a | 🟡 in-progress (PR pending) | §4.2 endpoint catalog (mobile 진입점 행 갱신 — `/api/auth/mobile/{signup,login}`), §11 Project Structure (Mobile auth ingress 결정 paragraph — Option B BFF mobile route + Set-Cookie 미발급 + JSON 토큰 직반환) | finalize patch 완료 — Option B 채택 명시 |
| IMPL-MOBILE-AUTH-002b | planned | §6 Rate Limiting (user-service `/auth/*` 한도 상향 — login 5→10/min, refresh 20→30/min, logout 신규 20/min) | finalize — 한도 수치 + env override 명시 |
| IMPL-MOBILE-AUTH-003 | 🟡 in-progress (PR pending) | §4.2 endpoint catalog (`/auth/refresh` 행에 enum 5종 reference), §9.3 Security 신규 서브섹션 "Refresh Token Reason Codes" (5종 enum + 발생 조건 + 클라이언트 권장 행동 + 불변식 5건) | finalize patch 완료 — spec.md §4.2 + §9.3 갱신 |
| IMPL-MOBILE-PAY-001a-1 | ✅ merged (PR #37) | §3 schema (`processed_events` expand DDL — `provider`, `event_id` NULL 허용 컬럼) | ✅ `SPEC-SYNC-PAY-001a-1` 완료 — §3 행 참조 |
| IMPL-MOBILE-PAY-001a-2 | ✅ merged (PR #40) | §3 schema (backfill + partial unique index `(provider, event_id) WHERE provider IS NOT NULL`, CHECK constraint) | ✅ `SPEC-SYNC-PAY-001a-2` 완료 — §3 행 참조 |
| IMPL-MOBILE-PAY-001b | ✅ merged (PR #39) | §4.2 Subscriptions (RevenueCat webhook 라우트 + entitlement → tier mapping) | ✅ `SPEC-SYNC-PAY-001b` 완료 — §3 행 참조 |
| IMPL-MOBILE-PAY-001c | backlog | §3 schema (`stripe_event_id` drop) | contract phase 별도 진행 |
| IMPL-MOBILE-SUB-SYNC-001 | ✅ merged (PR #41) | §4.2 Subscriptions Internal (`POST /internal/subscriptions/refresh-from-revenuecat` + 캐시 정책 source=purchase 우회 / source=app_open 60s) | ✅ `SPEC-SYNC-SUB-001` 완료 — §3 행 참조 |

### Session C — BFF + CI

| Task ID | 상태 | spec.md 갱신 의무 섹션 | Sync 트리거 |
|---------|------|------------------------|-------------|
| IMPL-MOBILE-BFF-001 | 🟡 in-progress | §11 Project Structure (BFF active gateway 명시 — banner 흡수), §9.3 Security (cookie + bearer 분기, authSource 트래킹, padToMinLatency timing oracle, /auth/refresh 예외) | finalize patch — hybrid BFF 본문 흡수의 첫 도화선 |
| IMPL-MOBILE-SUB-SYNC-002 | planned | §11 BFF layer (신규 라우트 `POST /api/subscriptions/sync`), §6.5 commerce | finalize patch |
| CHORE-MOBILE-001 | planned | §11 CI/build (mobile-ci.yml + ESLint overrides) | finalize patch (light) |

### Mobile App (동료 작업 — 참고용)

> JUNWON 직접 작업 아님. 동료가 본인 일정으로 진행하며, 동료의 PR 도 본 레지스트리의 sync 의무를 따른다.

| Task ID | 상태 | spec.md 갱신 의무 섹션 | Sync 트리거 |
|---------|------|------------------------|-------------|
| IMPL-MOBILE-WORKSPACE-001 | next (동료) | §11 Project Structure (`apps/mobile/` 트리, Expo / EAS, Metro monorepo) | finalize patch |
| M0 Scaffold | (동료) | §11 (`apps/mobile` 추가, Metro `resolveRequest`, ESLint `no-restricted-imports`), §11 EAS 비용 정책 | M0 통합 PR 시 patch |
| M0.5 Release Readiness | (동료) | §11 (mobile-ci.yml — JUNWON CHORE-MOBILE-001 와 정합), §6 (Apple App Privacy 매핑, Google Play Data Safety) | M0.5 PR |
| M1 인증 | (동료) | §6 Security (Amplify SRP → id_token → user-service 교환 흐름, SecureStore refresh JWT 저장) | M1 PR |
| M2 API client + refresh 상태머신 | (동료) | §6 Security (refresh code enum 클라이언트 분기 — AUTH-003 짝), §11 fetch wrapper | M2 PR |
| M3 Claim feed | (동료) | §7 UX (Tab 1 — mobile 화면 구조), §3.5 LifestyleClaim (mobile read path) | M3 PR |
| M4 Onboarding + bio-profile | (동료) | §3.3 bio-profile (mobile 입력 flow, PHI 고지 모달), §6 PHI 최소화 | M4 PR |
| M5 Inspired plan + IAP | (동료) | §6.5 commerce (IAP → BFF sync → entitlement 흐름), §7 UX paywall, §6 PHI disclaimer | M5 PR |

### Backlog (현재 우선순위 외)

| Task ID | spec.md 갱신 의무 섹션 |
|---------|------------------------|
| CHORE-MOBILE-002 | §6 Security (refresh TTL 7-14d, device_tracking 컬럼) |
| IMPL-MOBILE-PUSH-001 | §6.5 push (FCM/APNs 디바이스 토큰 등록), §11 |
| IMPL-MOBILE-UPLOAD-001 | §11 (S3 presigned upload 라우트), §3 daily-log 식사 사진 |

## 3. retroactive backfill 의무

본 레지스트리 신설 (2026-05-07) 이전에 머지된 mobile-pivot task 는 spec.md sync 가 누락돼 있다. 다음 SPEC-SYNC-* task 로 분리 처리:

| 신규 Task | 대상 머지 task | spec.md 갱신 영역 |
|-----------|----------------|-------------------|
| ✅ `SPEC-SYNC-INFRA-001` | INFRA-MOBILE-001 (PR #35) | §11.1 Cognito Identity Resources — bff/mobile public client + audience 배열 |
| ✅ `SPEC-SYNC-AUTH-001` | IMPL-MOBILE-AUTH-001 (PR #36) | §4.2 Auth — audience 배열 ANY-match 검증, Appendix A — `COGNITO_MOBILE_CLIENT_ID` |
| ✅ `SPEC-SYNC-PAY-001a-1` | IMPL-MOBILE-PAY-001a-1 (PR #37) | §3.1 — `processed_events` 테이블 신설 + dual-provider 컬럼 (`provider`, `event_id` NULL 허용) |
| ✅ `SPEC-SYNC-PAY-001a-2` | IMPL-MOBILE-PAY-001a-2 (PR #40) | §3.1 — `processed_events_provider_check` CHECK + partial UNIQUE `(provider, event_id) WHERE provider IS NOT NULL` |
| ✅ `SPEC-SYNC-PAY-001b` | IMPL-MOBILE-PAY-001b (PR #39) | §4.2 Subscriptions — `/webhooks/revenuecat` 라우트 + entitlement → tier mapping |
| ✅ `SPEC-SYNC-SUB-001` | IMPL-MOBILE-SUB-SYNC-001 (PR #41) | §4.2 Subscriptions Internal — refresh-from-revenuecat + 캐시 정책 (source=purchase 우회 / 60s) |

각 SPEC-SYNC-* task 는 단일 commit, light review (L1 ~ L2), 본 레지스트리 행에 ✅ 표기 후 closing.

## 4. 최종 결과 (long-horizon)

본 레지스트리의 모든 행이 ✅ 가 되면 spec.md 본문이 mobile-first reality 와 정합된다. 그 시점에 PIVOT BANNER (spec.md line 3-9) 의 "본문 재작성은 별도 task 로 분리" 문구를 제거하고, banner 를 짧은 changelog 줄로 축소한다.

## 5. Cross-references

- `spec.md` line 3-9 — PIVOT BANNER (본 레지스트리의 source override)
- `.claude/rules/spec-dod.md` § "MOBILE PIVOT spec sync 의무" — 본 레지스트리 인용 강제 규칙
- `scripts/gate-check.sh spec_sync` — PR 머지 전 자동 검증 (TASK-ID 매칭 + spec.md diff 또는 deferral marker 존재 확인)
- `docs/MOBILE-ROADMAP.md` §5 Track ID Index — 본 레지스트리와 동기화
- Plan v5 (`/Users/junwon/.claude/plans/toasty-roaming-storm.md`, private) — task 정의의 source of truth
