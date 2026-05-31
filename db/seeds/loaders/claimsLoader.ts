import type pg from 'pg';
import type { ClaimStory } from '@celebbase/shared-types';

// Shape of db/seeds/lifestyle-claims/<slug>.json. Authored to the lifestyle_claims
// + claim_sources schema (migration 0014). base_diet_id / disclaimer_key are
// optional in the source data.
export interface SeedClaimSource {
  source_type: string;
  outlet: string;
  url?: string | null;
  excerpt?: string | null;
  published_date?: string | null;
  is_primary?: boolean;
}

export interface SeedClaim {
  claim_type: string;
  headline: string;
  body?: string | null;
  trust_grade: string;
  primary_source_url?: string | null;
  verified_by?: string | null;
  is_health_claim?: boolean;
  disclaimer_key?: string | null;
  /**
   * Optional. Celebrity slug whose **active base_diet** the loader resolves and
   * stores in `lifestyle_claims.base_diet_id`. Powers the claim → meal-plan CTA
   * (ClaimDetailScreen "Eat like this celebrity"). Typically equals the file's
   * own `celebrity_slug` (the claim points at its own celeb's diet), but kept
   * explicit so a claim can link to a different celeb's diet later.
   * NULL/omitted ⇒ CTA hidden.
   */
  base_diet_id_slug?: string | null;
  /**
   * Optional. 카드뉴스 6슬라이드 리치 카피(detail-only). 앱 캐러셀 + SNS 단일 원본.
   * 생략/null ⇒ 앱은 하드코딩 템플릿 fallback. (IMPL-MOBILE-CLAIM-STORY-SCHEMA-001)
   */
  story?: ClaimStory | null;
  tags?: string[];
  status?: string;
  sources?: SeedClaimSource[];
}

export interface SeedClaimsFile {
  /**
   * 셀럽 attribution. 생략/null ⇒ 셀럽 없는 웰니스 트렌드 카드(`celebrity_id` NULL).
   * 무셀럽 파일은 `trend-*.json` 네이밍 컨벤션을 따른다(run.ts discovery + celeb 파일 충돌 방지).
   */
  celebrity_slug?: string | null;
  claims: SeedClaim[];
}

async function resolveCelebrityId(client: pg.PoolClient, slug: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM celebrities WHERE slug = $1 LIMIT 1',
    [slug],
  );
  if (!rows[0]) throw new Error(`claimsLoader: celebrity not found for slug "${slug}"`);
  return rows[0].id;
}

/**
 * Resolve `claim.base_diet_id_slug` → `lifestyle_claims.base_diet_id` by joining
 * through `celebrities.slug` to its **single active** base_diet. base_diets has
 * no slug column of its own (schema 0001); we treat the slug as the celebrity's
 * slug because the demo invariant is "one active base_diet per celeb"
 * (idx_base_diets_celeb WHERE is_active = TRUE). Throws if the celeb has no
 * active base_diet — fail-loud so a typo'd slug doesn't silently drop the CTA.
 */
async function resolveBaseDietId(client: pg.PoolClient, celebritySlug: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT bd.id FROM base_diets bd
       JOIN celebrities c ON c.id = bd.celebrity_id
      WHERE c.slug = $1 AND bd.is_active = TRUE
      ORDER BY bd.created_at DESC
      LIMIT 1`,
    [celebritySlug],
  );
  if (!rows[0]) {
    throw new Error(
      `claimsLoader: no active base_diet for celebrity "${celebritySlug}" (base_diet_id_slug)`,
    );
  }
  return rows[0].id;
}

// Idempotent on (celebrity_id, headline) — lifestyle_claims has no natural unique
// constraint, so re-running the seed must not duplicate rows.
export async function loadClaims(
  client: pg.PoolClient,
  file: SeedClaimsFile,
): Promise<number> {
  // 무셀럽 트렌드 카드면 celebrity_id NULL. resolveCelebrityId 는 slug 가 주어졌는데
  // 못 찾으면 여전히 throw(fail-loud) — 오타로 잘못된 셀럽 연결되는 것 방지.
  const celebrityId =
    file.celebrity_slug != null ? await resolveCelebrityId(client, file.celebrity_slug) : null;
  let inserted = 0;

  for (const claim of file.claims) {
    // Resolve up front so we can also backfill existing rows that pre-date the
    // base_diet_id_slug field (the seed is idempotent on (celebrity_id, headline)).
    const baseDietId =
      claim.base_diet_id_slug !== null && claim.base_diet_id_slug !== undefined
        ? await resolveBaseDietId(client, claim.base_diet_id_slug)
        : null;

    // IS NOT DISTINCT FROM — celebrity_id NULL(무셀럽 카드)에서도 (NULL=NULL) 매칭되어
    // 멱등성 유지(= 단순 `celebrity_id = $1` 은 NULL 을 못 잡아 재시드 시 중복 삽입).
    const existing = await client.query<{
      id: string;
      base_diet_id: string | null;
      story: unknown;
    }>(
      `SELECT id, base_diet_id, story FROM lifestyle_claims
        WHERE celebrity_id IS NOT DISTINCT FROM $1 AND headline = $2
        LIMIT 1`,
      [celebrityId, claim.headline],
    );
    if (existing.rows[0]) {
      // Backfill base_diet_id when (a) seed now specifies it and (b) the existing
      // row's column is NULL (don't clobber operator overrides). Other columns are
      // intentionally NOT touched — content drift is owned by an admin tool, not
      // the seed loader.
      if (baseDietId !== null && existing.rows[0].base_diet_id === null) {
        await client.query(
          'UPDATE lifestyle_claims SET base_diet_id = $1 WHERE id = $2',
          [baseDietId, existing.rows[0].id],
        );
      }
      // Backfill story under the same fill-if-NULL rule (rows pre-date the story
      // field). Don't clobber an existing story (operator/admin override).
      if (claim.story != null && existing.rows[0].story === null) {
        await client.query('UPDATE lifestyle_claims SET story = $1::jsonb WHERE id = $2', [
          JSON.stringify(claim.story),
          existing.rows[0].id,
        ]);
      }
      continue;
    }

    const status = claim.status ?? 'draft';
    // Compute published_at in JS — passing it as its own param avoids reusing the
    // status param in two type contexts (enum column + CASE text compare), which
    // breaks PG parameter type inference.
    const publishedAt = status === 'published' ? new Date() : null;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO lifestyle_claims (
         celebrity_id, claim_type, headline, body, trust_grade, primary_source_url,
         verified_by, is_health_claim, disclaimer_key, base_diet_id, tags, status,
         published_at, story
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
       RETURNING id`,
      [
        celebrityId,
        claim.claim_type,
        claim.headline,
        claim.body ?? null,
        claim.trust_grade,
        claim.primary_source_url ?? null,
        claim.verified_by ?? null,
        claim.is_health_claim ?? false,
        claim.disclaimer_key ?? null,
        baseDietId,
        claim.tags ?? [],
        status,
        publishedAt,
        claim.story != null ? JSON.stringify(claim.story) : null,
      ],
    );
    const claimId = rows[0]?.id;
    if (!claimId) throw new Error(`claimsLoader: insert failed for "${claim.headline}"`);
    inserted += 1;

    for (const src of claim.sources ?? []) {
      await client.query(
        `INSERT INTO claim_sources (
           claim_id, source_type, outlet, url, excerpt, published_date, is_primary
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          claimId,
          src.source_type,
          src.outlet,
          src.url ?? null,
          src.excerpt ?? null,
          src.published_date ?? null,
          src.is_primary ?? false,
        ],
      );
    }
  }

  return inserted;
}
