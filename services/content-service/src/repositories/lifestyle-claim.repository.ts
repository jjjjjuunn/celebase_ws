import type pg from 'pg';
import type {
  LifestyleClaim,
  ClaimSource,
  ClaimType,
  ClaimStatus,
  TrustGrade,
} from '@celebbase/shared-types';

export interface ListLifestyleClaimOptions {
  claim_type?: ClaimType | undefined;
  trust_grade?: TrustGrade | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface ListAdminClaimOptions {
  status?: ClaimStatus | undefined;
  claim_type?: ClaimType | undefined;
  trust_grade?: TrustGrade | undefined;
  celebrity_id?: string | undefined;
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

// ── Admin moderation queries (IMPL-021, spec §9.3 #5/#6) ──────────────
//
// Public 라우트는 항상 status='published' AND is_active=TRUE 로 좁히지만,
// admin 라우트는 status 무관 + draft/archived 포함 조회/전이를 수행한다.
// celebrity is_active 조건은 부여하지 않아 비활성화된 셀럽의 archived 클레임도
// moderation 큐에 그대로 노출된다 (재활성 시 재검토 위함).

export async function findByIdAdmin(
  pool: pg.Pool,
  id: string,
): Promise<LifestyleClaimWithSources | null> {
  const sql = `
    SELECT ${CLAIM_COLUMNS}
    FROM lifestyle_claims AS lc
    WHERE lc.id = $1 AND lc.is_active = TRUE
    LIMIT 1
  `;
  const { rows } = await pool.query<LifestyleClaim>(sql, [id]);
  const claim = rows[0];
  if (!claim) return null;
  const sources = await findSourcesByClaimId(pool, claim.id);
  return { ...claim, sources };
}

export async function listForModeration(
  pool: pg.Pool,
  opts: ListAdminClaimOptions,
): Promise<ListResult<LifestyleClaim>> {
  const limit = clampLimit(opts.limit);

  const whereClauses: string[] = ['lc.is_active = TRUE'];
  const values: unknown[] = [];

  if (opts.status !== undefined) {
    values.push(opts.status);
    whereClauses.push(`lc.status = $${String(values.length)}`);
  }
  if (opts.claim_type !== undefined) {
    values.push(opts.claim_type);
    whereClauses.push(`lc.claim_type = $${String(values.length)}`);
  }
  if (opts.trust_grade !== undefined) {
    values.push(opts.trust_grade);
    whereClauses.push(`lc.trust_grade = $${String(values.length)}`);
  }
  if (opts.celebrity_id !== undefined) {
    values.push(opts.celebrity_id);
    whereClauses.push(`lc.celebrity_id = $${String(values.length)}`);
  }

  // admin cursor 는 created_at desc, id desc 기준 — published_at 은 draft 단계에서 NULL
  const decoded = opts.cursor !== undefined ? decodeAdminCursor(opts.cursor) : null;
  if (decoded !== null) {
    values.push(decoded.created_at);
    const createdParam = `$${String(values.length)}`;
    values.push(decoded.id);
    const idParam = `$${String(values.length)}`;
    whereClauses.push(
      `(lc.created_at, lc.id) < (${createdParam}::timestamptz, ${idParam}::uuid)`,
    );
  }

  values.push(limit + 1);
  const limitParam = `$${String(values.length)}`;

  const sql = `
    SELECT ${CLAIM_COLUMNS}
    FROM lifestyle_claims AS lc
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY lc.created_at DESC, lc.id DESC
    LIMIT ${limitParam}
  `;

  const { rows } = await pool.query<LifestyleClaim>(sql, values);
  const hasNext = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, has_next: hasNext, next_cursor: buildAdminCursor(items, hasNext) };
}

interface AdminCursorPayload {
  created_at: string;
  id: string;
}

function encodeAdminCursor(payload: AdminCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeAdminCursor(cursor: string): AdminCursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'created_at' in parsed &&
      'id' in parsed &&
      typeof (parsed as Record<string, unknown>).created_at === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    ) {
      return parsed as AdminCursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function buildAdminCursor(items: LifestyleClaim[], hasNext: boolean): string | null {
  if (!hasNext) return null;
  const last = items[items.length - 1];
  if (!last) return null;
  return encodeAdminCursor({
    created_at:
      last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at),
    id: last.id,
  });
}

export type StatusTransitionResult =
  | { ok: true; claim: LifestyleClaim }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'celebrity_inactive'
        | 'grade_E_blocked'
        | 'grade_D_requires_disclaimer';
    };

export interface TransitionStatusInput {
  toStatus: ClaimStatus;
  /** D 등급 publish 시 보충/유지할 disclaimer key. null 이면 기존 값 유지. */
  disclaimer_key?: string | null | undefined;
}

/**
 * Admin status transition (spec §9.3 #5).
 *
 * - published 로 전환 시 trust_grade 'E' 거부, 'D' + disclaimer_key NULL 거부.
 * - published 전환 시 published_at 을 NOW() 로 세팅 (draft → published 첫 전이만).
 * - archived → draft 재전환은 published_at 을 보존 (재발행 이력 추적).
 * - DB CHECK constraint `trust_grade_published_gate` 가 최후 방어선.
 */
export async function transitionStatus(
  pool: pg.Pool,
  id: string,
  input: TransitionStatusInput,
): Promise<StatusTransitionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // published 전환 시: cascade_celebrity_deactivate_to_claims 트리거와의 deadlock 방지를 위해
    // celebrities → lifestyle_claims 순서로 잠근다 (트리거의 락 순서와 동일).
    // celebrities.is_active=FALSE 인 경우 admin 이 archived → published 로 되살리는 우회 차단.
    if (input.toStatus === 'published') {
      const cidRes = await client.query<{ celebrity_id: string }>(
        `SELECT celebrity_id FROM lifestyle_claims WHERE id = $1 AND is_active = TRUE`,
        [id],
      );
      const cidRow = cidRes.rows[0];
      if (!cidRow) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_found' };
      }
      const celebRes = await client.query<{ is_active: boolean }>(
        `SELECT is_active FROM celebrities WHERE id = $1 FOR SHARE`,
        [cidRow.celebrity_id],
      );
      const celebRow = celebRes.rows[0];
      if (!celebRow || !celebRow.is_active) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'celebrity_inactive' };
      }
    }

    const lockSql = `
      SELECT id, trust_grade, status, disclaimer_key, published_at
      FROM lifestyle_claims
      WHERE id = $1 AND is_active = TRUE
      FOR UPDATE
    `;
    const locked = await client.query<{
      id: string;
      trust_grade: TrustGrade;
      status: ClaimStatus;
      disclaimer_key: string | null;
      published_at: Date | null;
    }>(lockSql, [id]);
    const current = locked.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }

    if (input.toStatus === 'published') {
      if (current.trust_grade === 'E') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'grade_E_blocked' };
      }
      const effectiveDisclaimer =
        input.disclaimer_key === undefined ? current.disclaimer_key : input.disclaimer_key;
      if (current.trust_grade === 'D' && (effectiveDisclaimer === null || effectiveDisclaimer === '')) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'grade_D_requires_disclaimer' };
      }
    }

    const setPublishedAt =
      input.toStatus === 'published' && current.published_at === null ? ', published_at = NOW()' : '';

    const params: unknown[] = [id, input.toStatus];
    let disclaimerSet = '';
    if (input.disclaimer_key !== undefined) {
      params.push(input.disclaimer_key);
      disclaimerSet = `, disclaimer_key = $${String(params.length)}`;
    }

    const updateSql = `
      UPDATE lifestyle_claims
      SET status = $2${disclaimerSet}${setPublishedAt}, updated_at = NOW()
      WHERE id = $1
      RETURNING ${CLAIM_COLUMNS.replace(/lc\./g, '')}
    `;
    const { rows } = await client.query<LifestyleClaim>(updateSql, params);
    await client.query('COMMIT');
    const updated = rows[0];
    if (!updated) return { ok: false, reason: 'not_found' };
    return { ok: true, claim: updated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setHealthClaim(
  pool: pg.Pool,
  id: string,
  isHealthClaim: boolean,
): Promise<LifestyleClaim | null> {
  const sql = `
    UPDATE lifestyle_claims
    SET is_health_claim = $2, updated_at = NOW()
    WHERE id = $1 AND is_active = TRUE
    RETURNING ${CLAIM_COLUMNS.replace(/lc\./g, '')}
  `;
  const { rows } = await pool.query<LifestyleClaim>(sql, [id, isHealthClaim]);
  return rows[0] ?? null;
}
