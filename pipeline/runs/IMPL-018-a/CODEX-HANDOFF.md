# CODEX-HANDOFF: IMPL-018-a

> 이 문서는 Claude가 작성하여 Codex에게 전달하는 구현 명세이다.
> Codex는 이 문서의 요구사항을 정확히 구현해야 한다.

## Task

**ID**: IMPL-018-a
**Title**: LifestyleClaim shared-types contract (Zod + entities + enums)
**Type**: feat
**Tier**: L2 (보안 규칙 미접촉, contract-only — review: Codex 1)
**Pivot**: PIVOT-2026-05 Phase 0 → Phase 1 진입 게이트

## Context

CelebBase 는 "셀럽 철학 기반 개인화 식단 추천" 에서 "출처 기반 셀럽 lifestyle claim 카드 피드" 로 피벗한다 (spec.md v1.5.0). 이번 작업은 신규 도메인 모델 `lifestyle_claims` + `claim_sources` 의 **shared-types 계약만** 선행 머지한다. 이 계약이 main 에 들어가면 BE 세션 (IMPL-018-b/-c, IMPL-019, IMPL-020, IMPL-021), BFF 세션 (BFF-018), FE 세션 (IMPL-UI-031~033) 이 동일 타입을 import 하여 병렬 진입할 수 있다.

이 sub-task 는 **contract-only**: Zod 스키마, Row 타입, enum 만 추가한다. DB migration·repository·route·service 코드는 IMPL-018-b/-c 에서 처리한다.

근거 spec 섹션:
- §3.4 Enum Glossary — `claim_type`, `trust_grade`, `claim_status` 신규 행
- §3.5 LifestyleClaim Domain Models — DDL 정의 (이번 작업은 Zod 만)
- §9.3 Security — Claim 도메인 안전/법적 7원칙

multi-session 계약: `pipeline/runs/PIVOT-2026-05/agreement.md` 의 "Locked enum changes" 섹션이 이 작업을 BE 세션 단독 hold 로 명시한다. 머지 후 다른 세션은 `git pull` 로 즉시 동기화한다 (`.claude/rules/multi-session.md` §2).

## Affected Packages/Services

- `packages/shared-types/` 만

다른 패키지/서비스는 절대 수정하지 않는다. `services/**`, `apps/**`, `db/migrations/**` 변경은 후속 sub-task (IMPL-018-b, IMPL-018-c, BFF-018, IMPL-UI-031~033) 에서 처리한다.

## File Budget

| 파일 | 작업 | 예산 |
|------|------|------|
| `packages/shared-types/src/schemas/lifestyle-claims.ts` | NEW | 1.5 |
| `packages/shared-types/src/enums.ts` | MODIFY (3 enum 추가) | 1.0 |
| `packages/shared-types/src/entities.ts` | MODIFY (LifestyleClaim, ClaimSource Row + parity guard) | 1.0 |
| `packages/shared-types/src/index.ts` | MODIFY (schemas export 자동 반영 — 본 파일은 이미 `schemas/index.ts` 를 re-export 함, 따라서 schemas barrel 만 수정) | 1.0 |

**합계 = 4.5 ✅** (한도 5.0 이하)

> **참고**: `index.ts` 는 이미 `export * as schemas from './schemas/index.js'` 가 있으므로 실제 수정은 `packages/shared-types/src/schemas/index.ts` (barrel) 에 `export * from './lifestyle-claims.js'` 한 줄 추가다. 4번째 파일 슬롯은 이 barrel 수정으로 사용한다.

## Requirements

### R1. `packages/shared-types/src/enums.ts` 수정

기존 `Sex` enum 뒤에 다음 3개 enum 을 추가한다 (spec §3.4 / §3.5.1 / §3.5.2 와 정확히 일치):

```typescript
export const ClaimType = z.enum([
  'food',
  'workout',
  'sleep',
  'beauty',
  'brand',
  'philosophy',
  'supplement',
]);
export type ClaimType = z.infer<typeof ClaimType>;

export const TrustGrade = z.enum(['A', 'B', 'C', 'D', 'E']);
export type TrustGrade = z.infer<typeof TrustGrade>;

export const ClaimStatus = z.enum(['draft', 'published', 'archived']);
export type ClaimStatus = z.infer<typeof ClaimStatus>;
```

순서/철자 변경 금지. spec.md §3.5.3 의 PostgreSQL `CREATE TYPE ... AS ENUM (...)` 값과 1:1 일치해야 한다.

### R2. `packages/shared-types/src/entities.ts` 수정

`Celebrity` interface 패턴(line 104~118)을 그대로 따라 다음 두 Row 타입을 추가한다. import 추가도 함께:

```typescript
// 파일 상단 import 블록에 추가
import type {
  CelebrityCategory,
  ClaimType,        // 추가
  ClaimStatus,      // 추가
  TrustGrade,       // 추가
  // ... 기존 import 유지
} from './enums.js';

// 파일 하단(가장 마지막 entity 뒤)에 추가
// ── lifestyle_claims ────────────────────────────────────────────────────────

export interface LifestyleClaim {
  id: string;
  celebrity_id: string;
  claim_type: ClaimType;
  headline: string;
  body: string | null;
  trust_grade: TrustGrade;
  primary_source_url: string | null;
  verified_by: string | null;
  last_verified_at: Date | null;
  is_health_claim: boolean;
  disclaimer_key: string | null;
  base_diet_id: string | null;
  tags: string[];
  status: ClaimStatus;
  published_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── claim_sources ───────────────────────────────────────────────────────────

export interface ClaimSource {
  id: string;
  claim_id: string;
  source_type:
    | 'interview'
    | 'social_post'
    | 'podcast'
    | 'book'
    | 'article'
    | 'press_release'
    | 'other';
  outlet: string;
  url: string | null;
  published_date: Date | null;
  excerpt: string | null;
  is_primary: boolean;
  created_at: Date;
}
```

`source_type` 은 spec §3.5.3 DDL 의 `CHECK (source_type IN (...))` 값 7개와 1:1 일치해야 한다. 별도 enum 으로 추출하지 않는다 — DB CHECK constraint 가 진실 원본이고, 다른 곳에서 재사용되지 않는다.

### R3. `packages/shared-types/src/schemas/lifestyle-claims.ts` (신규 파일)

새 파일을 작성한다. 기존 `schemas/celebrities.ts` 의 패턴을 따른다:

```typescript
import { z } from 'zod';
import { ClaimType, ClaimStatus, TrustGrade } from '../enums.js';
import type { LifestyleClaim, ClaimSource } from '../entities.js';

// ── Wire schemas (API 직렬화 형식: Date → ISO 8601 string) ─────────────

export const ClaimSourceWireSchema = z.object({
  id: z.string().uuid(),
  claim_id: z.string().uuid(),
  source_type: z.enum([
    'interview',
    'social_post',
    'podcast',
    'book',
    'article',
    'press_release',
    'other',
  ]),
  outlet: z.string().min(1).max(200),
  url: z.string().url().max(2048).nullable(),
  published_date: z.string().date().nullable(), // YYYY-MM-DD
  excerpt: z.string().max(300).nullable(),
  is_primary: z.boolean(),
  created_at: z.string().datetime(),
});
export type ClaimSourceWire = z.infer<typeof ClaimSourceWireSchema>;

export const LifestyleClaimWireSchema = z.object({
  id: z.string().uuid(),
  celebrity_id: z.string().uuid(),
  claim_type: ClaimType,
  headline: z.string().min(1).max(280),
  body: z.string().max(10000).nullable(),
  trust_grade: TrustGrade,
  primary_source_url: z.string().url().max(2048).nullable(),
  verified_by: z.string().max(100).nullable(),
  last_verified_at: z.string().datetime().nullable(),
  is_health_claim: z.boolean(),
  disclaimer_key: z.string().max(100).nullable(),
  base_diet_id: z.string().uuid().nullable(),
  tags: z.array(z.string()),
  status: ClaimStatus,
  published_at: z.string().datetime().nullable(),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type LifestyleClaimWire = z.infer<typeof LifestyleClaimWireSchema>;

// ── Response schemas ──────────────────────────────────────────────────

export const LifestyleClaimDetailResponseSchema = z.object({
  claim: LifestyleClaimWireSchema,
  sources: z.array(ClaimSourceWireSchema),
});
export type LifestyleClaimDetailResponse = z.infer<
  typeof LifestyleClaimDetailResponseSchema
>;

export const LifestyleClaimListResponseSchema = z.object({
  claims: z.array(LifestyleClaimWireSchema),
  next_cursor: z.string().nullable(),
  has_next: z.boolean(),
});
export type LifestyleClaimListResponse = z.infer<
  typeof LifestyleClaimListResponseSchema
>;

// ── Wire↔Row parity guards (D1, celebrities.ts:72~88 패턴) ─────────────

const _lifestyleClaimWireRowParity =
  null as unknown as LifestyleClaimWire satisfies {
    id: LifestyleClaim['id'];
    celebrity_id: LifestyleClaim['celebrity_id'];
    claim_type: LifestyleClaim['claim_type'];
    headline: LifestyleClaim['headline'];
    body: LifestyleClaim['body'];
    trust_grade: LifestyleClaim['trust_grade'];
    primary_source_url: LifestyleClaim['primary_source_url'];
    verified_by: LifestyleClaim['verified_by'];
    last_verified_at: string | null;
    is_health_claim: LifestyleClaim['is_health_claim'];
    disclaimer_key: LifestyleClaim['disclaimer_key'];
    base_diet_id: LifestyleClaim['base_diet_id'];
    tags: LifestyleClaim['tags'];
    status: LifestyleClaim['status'];
    published_at: string | null;
    is_active: LifestyleClaim['is_active'];
    created_at: string;
    updated_at: string;
  };
void _lifestyleClaimWireRowParity;

const _claimSourceWireRowParity =
  null as unknown as ClaimSourceWire satisfies {
    id: ClaimSource['id'];
    claim_id: ClaimSource['claim_id'];
    source_type: ClaimSource['source_type'];
    outlet: ClaimSource['outlet'];
    url: ClaimSource['url'];
    published_date: string | null;
    excerpt: ClaimSource['excerpt'];
    is_primary: ClaimSource['is_primary'];
    created_at: string;
  };
void _claimSourceWireRowParity;
```

핵심 규칙:
- 모든 URL 필드는 `z.string().url().max(2048)` 으로 길이 상한 강제 (SSRF/DoS 방어 — `.claude/rules/security.md` SSRF Guard)
- `headline` 은 `z.string().min(1).max(280)`, `body` 는 `z.string().max(10000).nullable()`, `excerpt` 는 `z.string().max(300).nullable()` — spec §3.5.3 DDL 의 컬럼 길이와 일치
- HTML sanitization 자체는 BE service layer 책임이지만, Zod 가 plain string 으로 검증하므로 wire 계약상 HTML tag 가 들어와도 reject 하지 않는다 (BE 가 strip 후 저장). FE 는 절대 `dangerouslySetInnerHTML` 로 렌더하지 않는다 (이 규칙은 IMPL-UI-031 HANDOFF 에서 명시됨)
- `tags` 는 `z.array(z.string())` — DB 측은 `TEXT[] DEFAULT '{}'` 이므로 빈 배열이 기본
- `is_health_claim` 은 wire 에서 `z.boolean()` (default 없음). 기본값 `false` 는 BE service 가 INSERT 시 적용

### R4. `packages/shared-types/src/schemas/index.ts` (barrel) 수정

기존 barrel 에 한 줄 추가:

```typescript
export * from './lifestyle-claims.js';
```

알파벳 순서로 적절한 위치에 삽입한다 (예: `celebrities.js` 와 `meal-plans.js` 사이). 다른 export 는 절대 건드리지 않는다.

`packages/shared-types/src/index.ts` 자체는 이미 `export * as schemas from './schemas/index.js'` 가 있으므로 **건드리지 않는다**. (만약 entities/enums 의 새 export 가 root 에서 즉시 노출되어야 하면 `enums.ts` 와 `entities.ts` 의 `export` 키워드만으로 자동 전파됨 — 별도 index.ts 수정 불필요)

## Acceptance Criteria

- [ ] `pnpm --filter @celebbase/shared-types build` 통과
- [ ] `pnpm --filter @celebbase/shared-types typecheck` 통과 (parity guard satisfies 절 통과 포함)
- [ ] `pnpm --filter @celebbase/shared-types lint` 경고 0건
- [ ] 신규 export 검증:
  ```bash
  node -e "const s = require('./packages/shared-types/dist/schemas/index.js'); \
    console.log(Object.keys(s).filter(k => k.includes('LifestyleClaim') || k.includes('ClaimSource')))"
  # 기대 출력: LifestyleClaimWireSchema, LifestyleClaimDetailResponseSchema, LifestyleClaimListResponseSchema, ClaimSourceWireSchema
  ```
- [ ] enum 노출 검증:
  ```bash
  grep -E "ClaimType|TrustGrade|ClaimStatus" packages/shared-types/dist/enums.js
  # 3개 enum 모두 등장
  ```
- [ ] parity guard 가 두 entity 모두에 존재 (검증: `grep -c "_lifestyleClaimWireRowParity\|_claimSourceWireRowParity" packages/shared-types/src/schemas/lifestyle-claims.ts` ≥ 4 — 선언 2 + void 2)
- [ ] 다른 워크스페이스 영향 없음: `pnpm -r typecheck` 가 main HEAD 와 동일 결과

## Constraints

- CODEX-INSTRUCTIONS.md 의 모든 규칙을 준수한다
- 위에 나열된 4 파일 외의 파일을 수정하지 않는다 (`services/**`, `apps/**`, `db/migrations/**`, 다른 `packages/**` 모두 금지)
- 신규 코드에 대한 테스트는 **이번 sub-task 에서 작성하지 않는다** — IMPL-018-b/-c 에서 통합 테스트로 검증
- TypeScript strict mode, `any` 타입 금지
- 외부 입력은 Zod 로 검증 (이번 작업 자체가 Zod 스키마 정의)
- 신규 npm 패키지 추가 금지 (`zod` 는 이미 의존성)

## DB Schema (repository/query 작업 시 필수)

N/A — DB 변경 없음 (이번 sub-task 는 contract-only). Migration 0014 는 IMPL-018-b 에서 처리.

참고용 DDL (spec.md §3.5.3 에서 발췌, **이번 작업에서 작성하지 않음**):

```sql
CREATE TYPE claim_type AS ENUM (
  'food', 'workout', 'sleep', 'beauty', 'brand', 'philosophy', 'supplement'
);
CREATE TYPE trust_grade AS ENUM ('A', 'B', 'C', 'D', 'E');
CREATE TYPE claim_status AS ENUM ('draft', 'published', 'archived');
-- (lifestyle_claims, claim_sources CREATE TABLE 은 IMPL-018-b 에서 작성)
```

위 enum 값 순서/철자가 R1 의 Zod enum 과 1:1 일치해야 한다.

## Reference Files

- `spec.md` §3.4, §3.5.1, §3.5.2, §3.5.3, §9.3
- `packages/shared-types/src/schemas/celebrities.ts` lines 72~88 — parity guard 패턴 정확히 복제
- `packages/shared-types/src/entities.ts` lines 104~118 — `Celebrity` interface 작성 패턴
- `packages/shared-types/src/enums.ts` — z.enum 추가 위치 (`Sex` 다음)
- `packages/shared-types/src/schemas/index.ts` — barrel export 위치
- `pipeline/runs/PIVOT-2026-05/agreement.md` — multi-session 계약 (이번 작업이 lock 대상)
- `.claude/rules/multi-session.md` §2 — shared-types 단일 hold 규칙
- `.claude/rules/code-style.md` § "BE Pydantic 필드명 실제 확인" — 본 작업은 Pydantic 측이 아직 없어 BE 측 진실원본은 spec §3.5.3 DDL 의 컬럼명

## Anti-Patterns (DO NOT)

1. **Parity guard 누락**: `_lifestyleClaimWireRowParity`, `_claimSourceWireRowParity` 두 개 모두 누락 시 Acceptance FAIL. `celebrities.ts:72~88` 패턴 그대로 — `null as unknown as XxxWire satisfies { ... }` + `void` 호출. `Date` 필드는 wire 측에서 `string` (ISO 8601), Row 측은 `Date` 이므로 parity guard 안에서 `string` 으로 명시.

2. **`url()` 단독 사용 (max 누락)**: `z.string().url()` 만 쓰면 무제한 길이 입력으로 메모리 폭증/DoS 가능. **항상 `.max(2048)` 와 페어**. `primary_source_url`, `claim_sources.url` 둘 다 적용.

3. **HTML 태그 허용 검증 빼먹기**: 이번 작업은 wire 계약상 plain string 만 받는다 (HTML tag reject 검증은 BE service 책임으로 위임). 그러나 Zod 에 `z.string().regex(/<[^>]+>/, 'no_html').not()` 같은 검증을 **추가하지 않는다** — `safeParse` 가 false-positive 로 정상 텍스트를 거부할 위험. spec §9.3 원칙 #1 에 따라 BE 가 `strip_tags` 로 처리한다.

4. **서비스/라우트/Repository 코드 포함**: 이번 sub-task 는 contract-only. `services/content-service/`, `db/migrations/0014_*.sql`, `apps/web/src/app/api/claims/*` 등은 **절대 작성하지 않는다**. IMPL-018-b/-c, BFF-018 의 영역.

5. **`import type` + 런타임 사용 혼용**: enum 은 **value import** 로 가져와야 한다. `entities.ts` 에서 `ClaimType` 을 type 자리에만 쓴다면 `import type { ClaimType }` 이 가능하지만, `schemas/lifestyle-claims.ts` 에서 `z.object({ claim_type: ClaimType })` 처럼 **runtime z.enum 값** 으로 쓰면 반드시 `import { ClaimType }` (value). 헷갈리면 `entities.ts` 도 value import 로 통일.

6. **`source_type` 별도 enum 추출**: `source_type` 은 `entities.ts` 의 `ClaimSource` interface 와 `schemas/lifestyle-claims.ts` 의 `ClaimSourceWireSchema` 두 곳에 inline 으로 두 번 작성한다. 별도 `SourceType` z.enum 으로 추출하지 않는다 — 다른 도메인에서 재사용 안 됨, parity guard 가 이미 두 정의 일치를 typecheck 한다.

7. **enum 값 임의 추가/순서 변경**: `claim_type` 7값, `trust_grade` 5값, `claim_status` 3값 모두 spec §3.5 / §3.4 와 정확히 일치. 임의로 추가 (`'cosmetic'`, `'F'` 등) 하거나 순서 바꾸지 않는다 — DB CREATE TYPE 과 정렬되어야 한다 (PostgreSQL enum 은 정의 순서가 ORDER BY 결과를 결정).

8. **(보너스) enum 변경의 multi-session 영향**: `enums.ts` 수정은 `.claude/rules/multi-session.md` §2 에 따라 BE 세션 단독 hold 후 즉시 main 머지가 강제된다. 본 작업이 main 에 머지되기 전까지 다른 세션은 enum 작업을 시작하지 않는다 (agreement.md 에 lock 기록됨).
