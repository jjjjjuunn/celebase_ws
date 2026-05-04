import type pg from 'pg';
import type { LifestyleClaim, ClaimSource, ClaimType, TrustGrade } from '@celebbase/shared-types';

export interface ListLifestyleClaimOptions {
  claim_type?: ClaimType | undefined;
  trust_grade?: TrustGrade | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface ListResult<T> {
  items: T[];
  has_next: boolean;
  next_cursor: string | null;
}

export interface LifestyleClaimWithSources extends LifestyleClaim {
  sources: ClaimSource[];
}

interface CursorPayload {
  published_at: string;
  id: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const CLAIM_COLUMNS = [
  'lc.id',
  'lc.celebrity_id',
  'lc.claim_type',
  'lc.headline',
  'lc.body',
  'lc.trust_grade',
  'lc.primary_source_url',
  'lc.verified_by',
  'lc.last_verified_at',
  'lc.is_health_claim',
  'lc.disclaimer_key',
  'lc.base_diet_id',
  'lc.tags',
  'lc.status',
  'lc.published_at',
  'lc.is_active',
  'lc.created_at',
  'lc.updated_at',
].join(', ');

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'published_at' in parsed &&
      'id' in parsed &&
      typeof (parsed as Record<string, unknown>).published_at === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

function buildNextCursor(items: LifestyleClaim[], hasNext: boolean): string | null {
  if (!hasNext) return null;
  const last = items[items.length - 1];
  if (!last) return null;
  if (last.published_at === null) return null;
  return encodeCursor({
    published_at: last.published_at instanceof Date ? last.published_at.toISOString() : String(last.published_at),
    id: last.id,
  });
}

export async function findById(
  pool: pg.Pool,
  id: string,
): Promise<LifestyleClaimWithSources | null> {
  const sql = `
    SELECT ${CLAIM_COLUMNS}
    FROM lifestyle_claims AS lc
    INNER JOIN celebrities AS c
      ON c.id = lc.celebrity_id
      AND c.is_active = TRUE
    WHERE lc.id = $1
      AND lc.is_active = TRUE
      AND lc.status = 'published'
    LIMIT 1
  `;
  const { rows } = await pool.query<LifestyleClaim>(sql, [id]);
  const claim = rows[0];
  if (!claim) return null;

  const sources = await findSourcesByClaimId(pool, claim.id);
  return { ...claim, sources };
}

export async function listByCelebrity(
  pool: pg.Pool,
  celebrityId: string,
  opts: ListLifestyleClaimOptions,
): Promise<ListResult<LifestyleClaim>> {
  const limit = clampLimit(opts.limit);

  const whereClauses: string[] = [
    'lc.is_active = TRUE',
    "lc.status = 'published'",
    'c.is_active = TRUE',
    'lc.celebrity_id = $1',
  ];
  const values: unknown[] = [celebrityId];

  if (opts.claim_type !== undefined) {
    values.push(opts.claim_type);
    whereClauses.push(`lc.claim_type = $${String(values.length)}`);
  }
  if (opts.trust_grade !== undefined) {
    values.push(opts.trust_grade);
    whereClauses.push(`lc.trust_grade = $${String(values.length)}`);
  }

  const decoded = opts.cursor !== undefined ? decodeCursor(opts.cursor) : null;
  if (decoded !== null) {
    values.push(decoded.published_at);
    const pubParam = `$${String(values.length)}`;
    values.push(decoded.id);
    const idParam = `$${String(values.length)}`;
    whereClauses.push(
      `(lc.published_at, lc.id) < (${pubParam}::timestamptz, ${idParam}::uuid)`,
    );
  }

  values.push(limit + 1);
  const limitParam = `$${String(values.length)}`;

  const sql = `
    SELECT ${CLAIM_COLUMNS}
    FROM lifestyle_claims AS lc
    INNER JOIN celebrities AS c
      ON c.id = lc.celebrity_id
      AND c.is_active = TRUE
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY lc.published_at DESC NULLS LAST, lc.id DESC
    LIMIT ${limitParam}
  `;

  const { rows } = await pool.query<LifestyleClaim>(sql, values);
  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, has_next: hasNext, next_cursor: buildNextCursor(items, hasNext) };
}

export async function listFeed(
  pool: pg.Pool,
  opts: ListLifestyleClaimOptions,
): Promise<ListResult<LifestyleClaim>> {
  const limit = clampLimit(opts.limit);

  const whereClauses: string[] = [
    'lc.is_active = TRUE',
    "lc.status = 'published'",
    'c.is_active = TRUE',
  ];
  const values: unknown[] = [];

  if (opts.claim_type !== undefined) {
    values.push(opts.claim_type);
    whereClauses.push(`lc.claim_type = $${String(values.length)}`);
  }
  if (opts.trust_grade !== undefined) {
    values.push(opts.trust_grade);
    whereClauses.push(`lc.trust_grade = $${String(values.length)}`);
  }

  const decoded = opts.cursor !== undefined ? decodeCursor(opts.cursor) : null;
  if (decoded !== null) {
    values.push(decoded.published_at);
    const pubParam = `$${String(values.length)}`;
    values.push(decoded.id);
    const idParam = `$${String(values.length)}`;
    whereClauses.push(
      `(lc.published_at, lc.id) < (${pubParam}::timestamptz, ${idParam}::uuid)`,
    );
  }

  values.push(limit + 1);
  const limitParam = `$${String(values.length)}`;

  const sql = `
    SELECT ${CLAIM_COLUMNS}
    FROM lifestyle_claims AS lc
    INNER JOIN celebrities AS c
      ON c.id = lc.celebrity_id
      AND c.is_active = TRUE
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY lc.published_at DESC NULLS LAST, lc.id DESC
    LIMIT ${limitParam}
  `;

  const { rows } = await pool.query<LifestyleClaim>(sql, values);
  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, has_next: hasNext, next_cursor: buildNextCursor(items, hasNext) };
}

export async function findSourcesByClaimId(
  pool: pg.Pool,
  claimId: string,
): Promise<ClaimSource[]> {
  const { rows } = await pool.query<ClaimSource>(
    `SELECT id, claim_id, source_type, outlet, url, published_date, excerpt, is_primary, created_at
     FROM claim_sources
     WHERE claim_id = $1
     ORDER BY is_primary DESC, created_at ASC`,
    [claimId],
  );
  return rows;
}
