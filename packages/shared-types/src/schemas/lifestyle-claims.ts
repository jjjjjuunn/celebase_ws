import { z } from 'zod';
import { ClaimType, ClaimStatus, TrustGrade } from '../enums.js';
import type { LifestyleClaim, ClaimSource, ClaimStory } from '../entities.js';

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
  // celebrity-optional: a wellness trend card may have no celebrity attribution
  // (IMPL-MOBILE-TREND-CARD-CELEB-OPTIONAL-001).
  celebrity_id: z.string().uuid().nullable(),
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
  // News 표지(피드 photo+hook) — story.hook 에서 파생한 lean 표지 2필드(detail-only story 대신).
  // story 없는 claim 은 null → mobile 이 텍스트 fallback 표지를 렌더. (IMPL-MOBILE-NEWS-COVER-001)
  cover_image_url: z.string().url().nullable().optional(),
  cover_hook: z.string().max(280).nullable().optional(),
});
export type LifestyleClaimWire = z.infer<typeof LifestyleClaimWireSchema>;

// ── Story (카드뉴스 6슬라이드 리치 카피 — detail-only JSONB) ────────────
// 모든 텍스트 plain + `**bold**`/`*accent*` 인라인 마크업. 비-strict(미래 필드 strip,
// forward-compat) — 권위 검증은 seed 의 _schema.json(additionalProperties:false).

const StorySlideHeadSchema = {
  eyebrow: z.string().optional(),
  headline: z.string(),
  // hero 이미지(절대 URL) + 배치. 권위 검증은 seed 의 _schema.json(format:uri, enum).
  image: z.string().url().nullable().optional(),
  layout: z.enum(['fullbleed', 'band']).optional(),
};

export const ClaimStorySchema = z.object({
  hook: z.object({ ...StorySlideHeadSchema, sub: z.string(), swipe: z.string().optional() }),
  what: z.object({
    ...StorySlideHeadSchema,
    rows: z.array(z.string()).min(1).max(4),
    source: z.string().optional(),
  }),
  science: z
    .object({
      ...StorySlideHeadSchema,
      checks: z.array(z.string()).max(4),
      caveat: z.string().optional(),
      source: z.string().optional(),
    })
    .nullable()
    .optional(),
  catch: z.object({ ...StorySlideHeadSchema, body: z.string() }),
  rescaled: z.object({
    ...StorySlideHeadSchema,
    profiles: z.array(z.object({ who: z.string(), what: z.string() })),
    source: z.string().optional(),
  }),
  cta: z.object({
    ...StorySlideHeadSchema,
    button: z.string().optional(),
    sub: z.string(),
    disclaimer: z.string().optional(),
  }),
});

// ── Response schemas ──────────────────────────────────────────────────

// detail claim = feed wire + story(nullable). story 는 detail-only(피드는 미포함 — payload lean).
export const LifestyleClaimDetailWireSchema = LifestyleClaimWireSchema.extend({
  story: ClaimStorySchema.nullable(),
});
export type LifestyleClaimDetailWire = z.infer<typeof LifestyleClaimDetailWireSchema>;

export const LifestyleClaimDetailResponseSchema = z.object({
  claim: LifestyleClaimDetailWireSchema,
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

// ── Admin write (create/edit) request schemas — admin CMS (IMPL-CONTENT-ADMIN-CMS-001) ──
// 사람이 작성하는 claim 입력. seed _schema.json claim shape 미러. content-service 가
// 요청 본문 검증에 사용. story 는 위 ClaimStorySchema(image/layout 포함) 재사용.

const AdminClaimSourceInputSchema = z
  .object({
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
    url: z.string().url().max(2048).nullable().optional(),
    published_date: z.string().date().nullable().optional(),
    excerpt: z.string().max(300).nullable().optional(),
    is_primary: z.boolean().optional(),
  })
  .strict();

export const AdminClaimCreateSchema = z
  .object({
    // create 시 셀럽 연결(loader 가 slug→id 해석). null/생략 ⇒ 무셀럽 트렌드 카드.
    celebrity_slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
    claim_type: ClaimType,
    headline: z.string().min(1).max(280),
    body: z.string().max(10000).nullable().optional(),
    trust_grade: TrustGrade,
    primary_source_url: z.string().url().max(2048).nullable().optional(),
    verified_by: z.string().max(100).nullable().optional(),
    is_health_claim: z.boolean(),
    disclaimer_key: z.string().max(100).nullable().optional(),
    base_diet_id_slug: z.string().nullable().optional(),
    story: ClaimStorySchema.nullable().optional(),
    tags: z.array(z.string().max(50)).max(20),
    status: ClaimStatus,
    sources: z.array(AdminClaimSourceInputSchema).min(1),
  })
  .strict();
export type AdminClaimCreate = z.infer<typeof AdminClaimCreateSchema>;

// PATCH(부분 편집) — 모든 필드 optional. 보낸 필드만 갱신.
export const AdminClaimUpdateSchema = AdminClaimCreateSchema.partial();
export type AdminClaimUpdate = z.infer<typeof AdminClaimUpdateSchema>;

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

// ClaimStorySchema(Zod) ↔ ClaimStory(entity) 양방향 parity (drift guard).
const _claimStoryParity = null as unknown as z.infer<typeof ClaimStorySchema> satisfies ClaimStory;
void _claimStoryParity;
const _claimStoryParityRev = null as unknown as ClaimStory satisfies z.infer<typeof ClaimStorySchema>;
void _claimStoryParityRev;

