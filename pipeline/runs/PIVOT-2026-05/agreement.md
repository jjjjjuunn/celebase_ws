# Pivot 2026-05 — Multi-Session Agreement

> 본 문서는 `.claude/rules/multi-session.md` §5 에 따른 사전 합의 기록이다.
> CelebBase 가 "셀럽 철학 기반 개인화 식단 추천" 에서 "출처 기반 셀럽 lifestyle claim 카드 피드" 로 피벗하는 과정에서 BE/BFF/FE 세션이 동시에 진입하는 것을 안전하게 조율한다.

**작성일**: 2026-05-03
**Spec 버전**: v1.5.0
**Coordination ID**: PIVOT-2026-05

---

## 1. Sessions

| 세션 | 담당 TASK-ID |
|------|-------------|
| **BE** | IMPL-018-a, IMPL-018-b, IMPL-018-c, IMPL-019, IMPL-020, IMPL-021 |
| **BFF** | BFF-018 |
| **FE** | IMPL-UI-031, IMPL-UI-032, IMPL-UI-033 |

세션 토폴로지는 `.claude/rules/multi-session.md` §1 과 동일하다. 각 세션은 자기 디렉토리 외 영역 진입 금지.

---

## 2. Locked enum changes (BE-session 단독 hold)

다음 변경은 **IMPL-018-a 1회의 머지** 안에서 처리된다. 다른 세션은 머지 완료 전까지 enum 작업 금지.

- `packages/shared-types/src/enums.ts`: `ClaimType` (7값), `TrustGrade` (5값), `ClaimStatus` (3값) z.enum 추가
- `packages/shared-types/src/entities.ts`: `LifestyleClaim`, `ClaimSource` Row interface + 위 3 enum import
- `packages/shared-types/src/schemas/lifestyle-claims.ts`: 신규 파일 (Wire schema + parity guard)
- `packages/shared-types/src/schemas/index.ts`: `export * from './lifestyle-claims.js'` 한 줄 추가

머지 직후 모든 세션은 `git pull` 로 sync. 이 시점부터 FE/BFF 세션 진입 가능.

---

## 3. BFF endpoint contract (frozen)

> BFF-018 의 라우트 계약은 본 합의로 동결된다. 변경 시 본 문서 PR 로 합의 갱신.

### `GET /api/celebrities/[slug]/claims`

특정 셀럽의 published claim 목록.

**Query**: `claim_type?` (ClaimType), `trust_grade?` (TrustGrade), `cursor?`, `limit?` (default 20, max 50)
**Response**: `LifestyleClaimListResponse`
**Auth**: external JWT (premium gating 미적용 — Phase 1)
**Filtering rule**: `JOIN celebrities ON c.id = lc.celebrity_id AND c.is_active = TRUE` + `lc.status = 'published' AND lc.is_active = TRUE`

### `GET /api/claims/feed`

전체 셀럽 mixed feed (홈 Tab 1).

**Query**: `claim_type?`, `cursor?`, `limit?` (default 20, max 50)
**Response**: `LifestyleClaimListResponse`
**Auth**: external JWT
**Ordering**: `published_at DESC NULLS LAST, id DESC` (cursor 안정성)

### `GET /api/claims/[id]`

claim 상세 + sources 인라인.

**Path**: `id` (UUID v7)
**Response**: `LifestyleClaimDetailResponse` (`claim` + `sources[]`)
**Auth**: external JWT
**404 조건**: 존재하지 않거나 `status != 'published'` 또는 `is_active = false` 또는 셀럽 비활성

### 명시적 비포함 (Phase 1+ 검토)

- 검색 (`?q=`), 태그 multi-filter, claim like/save — Phase 1+ 별도 티켓
- admin 라우트 (`/admin/claims/...`) — IMPL-021 영역, BFF-018 스코프 외

---

## 4. FE mock data policy

FE 세션은 BFF-018 머지 전까지 mock fixture 로 진척한다.

**Fixture 경로**: `apps/web/src/fixtures/lifestyle-claims.fixture.ts` (IMPL-UI-031 에서 생성)
**환경 분기**: `NEXT_PUBLIC_USE_MOCK_CLAIMS=true` (`.env.local`) 시 fetcher 가 fixture 반환
**전환 시점**: BFF-018 머지 + 통합 smoke 통과 후 `NEXT_PUBLIC_USE_MOCK_CLAIMS=false`

Mock fixture 는 `LifestyleClaimWireSchema.parse()` 통과해야 한다 — shared-types 계약 위반 방지.

---

## 5. 신규 ENV 변수

| 변수 | 추가 대상 | 기본값 | 용도 |
|------|----------|--------|------|
| `NEXT_PUBLIC_USE_MOCK_CLAIMS` | `apps/web/.env.example` | `false` | FE mock 분기 (§4) |
| `CONTENT_SERVICE_URL` | 이미 존재 | — | BFF-018 가 `/internal/claims/*` 호출 시 사용 |

신규 ENV 추가 시 양쪽 `.env.example` 동시 업데이트 — IMPL-UI-031 (FE) 와 BFF-018 (BFF) 의 첫 commit 에 포함.

---

## 6. DB migration 처리

- `db/migrations/0014_lifestyle_claims.sql` 은 **BE 세션 단독 처리** (IMPL-018-b)
- FE/BFF 는 migration 파일 직접 수정 금지. 스키마 의문 시 `spec.md §3.5.3` 또는 BE 세션과 합의

---

## 7. Docker compose 영향

이번 피벗은 신규 서비스를 추가하지 않는다 (`content-service` 에 라우트만 추가 — IMPL-018-c). 따라서 `docker-compose.yml` 포트 변경 없음.

`grep -A1 'ports:' docker-compose.yml` 로 충돌 없음 사전 확인 완료 (2026-05-03).

---

## 8. 의존 그래프 & 진입 시퀀스

```
Phase 0 (완료, 본 합의 작성 시점)
  └─ spec v1.5.0 + tasks.yaml + IMPL-018-a HANDOFF + 본 agreement.md

Phase 1 진입
  IMPL-018-a (BE, contract-only) → main 머지
  ├─ 머지 직후: FE/BFF 세션 git pull 후 진입 가능
  ├─ IMPL-018-b (BE, migration + repository)        ─┐
  ├─ IMPL-018-c (BE, routes + integ tests)           │
  ├─ BFF-018 (BFF, proxy routes)                     ├─ 병렬
  ├─ IMPL-019 (human, seed JSON + allowlist)         │
  ├─ IMPL-UI-031 (FE, ClaimCard component)           ─┘
  │
  └─ Phase 1 마감 게이트:
     IMPL-UI-032/033 (FE, 홈 + 셀럽 프로필) ← BFF-018 + IMPL-UI-031 머지 후
     IMPL-020 (BE, meal plan CTA) ← IMPL-018-c + IMPL-019 후
     IMPL-021 (BE, admin moderation) ← IMPL-018-c 후
```

---

## 9. 48h Integration Gate (강제)

`.claude/rules/multi-session.md` §4 "이틀 룰" 적용. IMPL-018-a 머지 시점부터 48시간 내 다음 통합 마일스톤 도달:

- [ ] BFF-018 라우트 main 머지 (`/api/claims/feed` 200 + Zod parse 성공)
- [ ] IMPL-UI-031 ClaimCard `/slice/claim-card/` 200
- [ ] FE → BFF mock-off smoke 1회 통과 (`NEXT_PUBLIC_USE_MOCK_CLAIMS=false` 로 `/api/claims/feed` 200 + 렌더)

미달 시 `ESCALATE_TO_HUMAN` 을 `docs/IMPLEMENTATION_LOG.md` 에 기록하고 본 합의 갱신.

48h 카운트 시작: IMPL-018-a 가 main 에 머지되는 시각 (PR squash merge timestamp 기준).

---

## 10. 충돌 해결 우선순위

`.claude/rules/multi-session.md` §9 인용 — 본 합의도 동일:

> 보안 > 개인정보 > 데이터 무결성 > 성능 > 편의

본 합의는 "편의·운영 효율" 영역이므로, claim 도메인의 **보안 7원칙** (spec §9.3 — HTML sanitize, URL allowlist, soft delete propagation, draft 미노출, trust gate, is_health_claim 주체, allowlist-only validator) 이 우선한다. 보안 위반 발견 시 본 합의의 세션 경계를 잠시 넘어 핫픽스 진행 가능.

---

## 11. 갱신 로그

| 일자 | 변경 | 작성자 |
|------|------|--------|
| 2026-05-03 | 초기 작성 (Phase 0 마감) | agent-claude-opus-4-7 |
