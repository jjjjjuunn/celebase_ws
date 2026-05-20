import type pg from 'pg';

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
  tags?: string[];
  status?: string;
  sources?: SeedClaimSource[];
}

export interface SeedClaimsFile {
  celebrity_slug: string;
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

// Idempotent on (celebrity_id, headline) — lifestyle_claims has no natural unique
// constraint, so re-running the seed must not duplicate rows.
export async function loadClaims(
  client: pg.PoolClient,
  file: SeedClaimsFile,
): Promise<number> {
  const celebrityId = await resolveCelebrityId(client, file.celebrity_slug);
  let inserted = 0;

  for (const claim of file.claims) {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM lifestyle_claims WHERE celebrity_id = $1 AND headline = $2 LIMIT 1',
      [celebrityId, claim.headline],
    );
    if (existing.rows[0]) continue;

    const status = claim.status ?? 'draft';
    // Compute published_at in JS — passing it as its own param avoids reusing the
    // status param in two type contexts (enum column + CASE text compare), which
    // breaks PG parameter type inference.
    const publishedAt = status === 'published' ? new Date() : null;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO lifestyle_claims (
         celebrity_id, claim_type, headline, body, trust_grade, primary_source_url,
         verified_by, is_health_claim, disclaimer_key, tags, status, published_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        claim.tags ?? [],
        status,
        publishedAt,
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
