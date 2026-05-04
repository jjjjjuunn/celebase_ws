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

