import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';
import {
  findById,
  listByCelebrity,
  listFeed,
  findSourcesByClaimId,
  findByIdAdmin,
  listForModeration,
  transitionStatus,
  setHealthClaim,
} from '../../src/repositories/lifestyle-claim.repository.js';

interface QueryResult<T> {
  rows: T[];
}

type MockQuery = jest.Mock<(sql: string, values?: unknown[]) => Promise<QueryResult<unknown>>>;

function makePool(): { pool: pg.Pool; query: MockQuery } {
  const query = jest.fn() as MockQuery;
  const pool = { query } as unknown as pg.Pool;
  return { pool, query };
}

const FIXED_DATE = new Date('2026-04-01T12:00:00.000Z');
const CELEBRITY_ID = '01000000-0000-7000-8000-000000000001';
const CLAIM_ID_1 = '01000000-0000-7000-8000-0000000000a1';
const CLAIM_ID_2 = '01000000-0000-7000-8000-0000000000a2';

function makeClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CLAIM_ID_1,
    celebrity_id: CELEBRITY_ID,
    claim_type: 'food',
    headline: 'celery juice every morning',
    body: null,
    trust_grade: 'B',
    primary_source_url: 'https://vogue.com/article/123',
    verified_by: 'editorial',
    last_verified_at: FIXED_DATE,
    is_health_claim: false,
    disclaimer_key: null,
    base_diet_id: null,
    tags: ['morning', 'detox'],
    status: 'published',
    published_at: FIXED_DATE,
    is_active: true,
    created_at: FIXED_DATE,
    updated_at: FIXED_DATE,
    ...overrides,
  };
}

function makeSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '01000000-0000-7000-8000-000000000051',
    claim_id: CLAIM_ID_1,
    source_type: 'interview',
    outlet: 'Vogue',
    url: 'https://vogue.com/article/123',
    published_date: '2025-12-01',
    excerpt: 'I drink celery juice every morning.',
    is_primary: true,
    created_at: FIXED_DATE,
    ...overrides,
  };
}

describe('lifestyle-claim.repository', () => {
  describe('findById', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('returns published claim with inline sources (R2/R3 gates applied)', async () => {
      query
        .mockResolvedValueOnce({ rows: [makeClaim()] })
        .mockResolvedValueOnce({
          rows: [
            makeSource({ is_primary: true, outlet: 'Vogue' }),
            makeSource({
              id: '01000000-0000-7000-8000-000000000052',
              is_primary: false,
              outlet: 'ELLE',
              url: 'https://elle.com/2',
            }),
          ],
        });

      const result = await findById(pool, CLAIM_ID_1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(CLAIM_ID_1);
      expect(result?.sources).toHaveLength(2);
      expect(result?.sources[0]?.is_primary).toBe(true);

      const claimSql = query.mock.calls[0]?.[0] ?? '';
      expect(claimSql).toMatch(/INNER JOIN celebrities AS c/);
      expect(claimSql).toMatch(/c\.is_active\s*=\s*TRUE/);
      expect(claimSql).toMatch(/lc\.is_active\s*=\s*TRUE/);
      expect(claimSql).toMatch(/lc\.status\s*=\s*'published'/);
      expect(query.mock.calls[0]?.[1]).toEqual([CLAIM_ID_1]);
    });

    it('returns null when claim row is absent (status filter or celebrity inactive)', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const result = await findById(pool, CLAIM_ID_1);

      expect(result).toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('listByCelebrity', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('fetches limit+1, sets has_next=true, encodes next_cursor from last item', async () => {
      const claimA = makeClaim({ id: CLAIM_ID_1 });
      const claimB = makeClaim({ id: CLAIM_ID_2, published_at: FIXED_DATE });
      const claimC = makeClaim({
        id: '01000000-0000-7000-8000-0000000000a3',
        published_at: FIXED_DATE,
      });
      query.mockResolvedValueOnce({ rows: [claimA, claimB, claimC] });

      const result = await listByCelebrity(pool, CELEBRITY_ID, { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.has_next).toBe(true);
      expect(result.next_cursor).not.toBeNull();

      const decoded: unknown = JSON.parse(
        Buffer.from(result.next_cursor as string, 'base64').toString('utf8'),
      );
      expect(decoded).toMatchObject({
        published_at: FIXED_DATE.toISOString(),
        id: CLAIM_ID_2,
      });

      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(/lc\.celebrity_id\s*=\s*\$1/);
      expect(values[0]).toBe(CELEBRITY_ID);
      expect(values[values.length - 1]).toBe(3);
    });

    it('applies claim_type and trust_grade filters with parameterized clauses', async () => {
      query.mockResolvedValueOnce({ rows: [makeClaim({ claim_type: 'workout', trust_grade: 'A' })] });

      await listByCelebrity(pool, CELEBRITY_ID, {
        claim_type: 'workout',
        trust_grade: 'A',
        limit: 5,
      });

      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(/lc\.claim_type\s*=\s*\$2/);
      expect(sql).toMatch(/lc\.trust_grade\s*=\s*\$3/);
      expect(values[0]).toBe(CELEBRITY_ID);
      expect(values[1]).toBe('workout');
      expect(values[2]).toBe('A');
      expect(values[values.length - 1]).toBe(6);
    });

    it('decodes valid cursor and adds composite (published_at, id) < ($N, $M) predicate', async () => {
      const cursorPayload = { published_at: FIXED_DATE.toISOString(), id: CLAIM_ID_1 };
      const cursor = Buffer.from(JSON.stringify(cursorPayload), 'utf8').toString('base64');
      query.mockResolvedValueOnce({ rows: [makeClaim({ id: CLAIM_ID_2 })] });

      const result = await listByCelebrity(pool, CELEBRITY_ID, { cursor, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.has_next).toBe(false);

      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(
        /\(lc\.published_at,\s*lc\.id\)\s*<\s*\(\$2::timestamptz,\s*\$3::uuid\)/,
      );
      expect(values[0]).toBe(CELEBRITY_ID);
      expect(values[1]).toBe(FIXED_DATE.toISOString());
      expect(values[2]).toBe(CLAIM_ID_1);
      expect(values[values.length - 1]).toBe(11);
    });
  });

  describe('listFeed', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('applies claim_type filter via parameterized clause', async () => {
      query.mockResolvedValueOnce({ rows: [makeClaim({ claim_type: 'workout' })] });

      await listFeed(pool, { claim_type: 'workout', limit: 10 });

      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(/lc\.claim_type\s*=\s*\$1/);
      expect(values[0]).toBe('workout');
      expect(values[values.length - 1]).toBe(11);
      expect(sql).toMatch(/c\.is_active\s*=\s*TRUE/);
      expect(sql).toMatch(/lc\.status\s*=\s*'published'/);
    });

    it('treats malformed cursor as no cursor (no throw, returns first page)', async () => {
      query.mockResolvedValueOnce({ rows: [makeClaim()] });

      const result = await listFeed(pool, { cursor: 'not-base64-json!', limit: 5 });

      expect(result.items).toHaveLength(1);
      expect(result.has_next).toBe(false);

      const sql = query.mock.calls[0]?.[0] ?? '';
      expect(sql).not.toMatch(/published_at,\s*lc\.id\)\s*</);
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(values).toEqual([6]);
    });

    it('applies trust_grade filter via parameterized clause', async () => {
      query.mockResolvedValueOnce({ rows: [makeClaim({ trust_grade: 'A' })] });

      await listFeed(pool, { trust_grade: 'A', limit: 10 });

      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(/lc\.trust_grade\s*=\s*\$1/);
      expect(values[0]).toBe('A');
      expect(values[values.length - 1]).toBe(11);
    });

    it('decodes valid cursor and adds composite predicate in feed query', async () => {
      const cursorPayload = { published_at: FIXED_DATE.toISOString(), id: CLAIM_ID_1 };
      const cursor = Buffer.from(JSON.stringify(cursorPayload), 'utf8').toString('base64');
      query.mockResolvedValueOnce({ rows: [makeClaim({ id: CLAIM_ID_2 })] });

      const result = await listFeed(pool, { cursor, limit: 7 });

      expect(result.items).toHaveLength(1);
      expect(result.has_next).toBe(false);

      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(
        /\(lc\.published_at,\s*lc\.id\)\s*<\s*\(\$1::timestamptz,\s*\$2::uuid\)/,
      );
      expect(values[0]).toBe(FIXED_DATE.toISOString());
      expect(values[1]).toBe(CLAIM_ID_1);
      expect(values[values.length - 1]).toBe(8);
    });
  });

  describe('decodeCursor invalid-shape branch', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('treats valid base64-JSON array (wrong shape) as no cursor', async () => {
      const cursor = Buffer.from(JSON.stringify([1, 2, 3]), 'utf8').toString('base64');
      query.mockResolvedValueOnce({ rows: [makeClaim()] });

      const result = await listFeed(pool, { cursor, limit: 5 });

      expect(result.items).toHaveLength(1);
      const sql = query.mock.calls[0]?.[0] ?? '';
      expect(sql).not.toMatch(/published_at,\s*lc\.id\)\s*</);
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(values).toEqual([6]);
    });

    it('treats valid base64-JSON object missing required fields as no cursor', async () => {
      const cursor = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64');
      query.mockResolvedValueOnce({ rows: [makeClaim()] });

      const result = await listFeed(pool, { cursor, limit: 5 });

      expect(result.items).toHaveLength(1);
      const sql = query.mock.calls[0]?.[0] ?? '';
      expect(sql).not.toMatch(/published_at,\s*lc\.id\)\s*</);
    });
  });

  describe('findSourcesByClaimId', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('orders is_primary=true first, then by created_at ASC', async () => {
      query.mockResolvedValueOnce({
        rows: [
          makeSource({ id: 'p1', is_primary: true }),
          makeSource({ id: 's1', is_primary: false }),
        ],
      });

      const sources = await findSourcesByClaimId(pool, CLAIM_ID_1);

      const sql = query.mock.calls[0]?.[0] ?? '';
      expect(sql).toMatch(/ORDER BY is_primary DESC,\s*created_at ASC/);
      expect(query.mock.calls[0]?.[1]).toEqual([CLAIM_ID_1]);
      expect(sources).toHaveLength(2);
    });
  });

  // ── Admin moderation queries (IMPL-021) ─────────────────────────────
  describe('findByIdAdmin', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('returns draft claim regardless of status (no published filter, no celebrity is_active filter)', async () => {
      query
        .mockResolvedValueOnce({ rows: [makeClaim({ status: 'draft', published_at: null })] })
        .mockResolvedValueOnce({ rows: [makeSource()] });

      const result = await findByIdAdmin(pool, CLAIM_ID_1);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('draft');
      const sql = query.mock.calls[0]?.[0] ?? '';
      expect(sql).not.toMatch(/\bc\.is_active/);
      expect(sql).not.toMatch(/INNER JOIN celebrities/);
      expect(sql).not.toMatch(/lc\.status\s*=\s*'published'/);
      expect(sql).toMatch(/lc\.id\s*=\s*\$1/);
    });

    it('returns null when claim row is absent', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const result = await findByIdAdmin(pool, CLAIM_ID_1);
      expect(result).toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('listForModeration', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('applies status, claim_type, trust_grade, celebrity_id filters with parameterized clauses', async () => {
      query.mockResolvedValueOnce({ rows: [makeClaim({ status: 'draft' })] });

      await listForModeration(pool, {
        status: 'draft',
        claim_type: 'food',
        trust_grade: 'B',
        celebrity_id: CELEBRITY_ID,
        limit: 10,
      });

      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(/lc\.status\s*=\s*\$1/);
      expect(sql).toMatch(/lc\.claim_type\s*=\s*\$2/);
      expect(sql).toMatch(/lc\.trust_grade\s*=\s*\$3/);
      expect(sql).toMatch(/lc\.celebrity_id\s*=\s*\$4/);
      expect(sql).toMatch(/ORDER BY lc\.created_at DESC,\s*lc\.id DESC/);
      expect(values[0]).toBe('draft');
      expect(values[1]).toBe('food');
      expect(values[2]).toBe('B');
      expect(values[3]).toBe(CELEBRITY_ID);
      expect(values[values.length - 1]).toBe(11);
    });

    it('encodes admin cursor on (created_at, id) when has_next', async () => {
      const claimA = makeClaim({ id: CLAIM_ID_1 });
      const claimB = makeClaim({ id: CLAIM_ID_2, created_at: FIXED_DATE });
      const claimC = makeClaim({ id: '01000000-0000-7000-8000-0000000000a3', created_at: FIXED_DATE });
      query.mockResolvedValueOnce({ rows: [claimA, claimB, claimC] });

      const result = await listForModeration(pool, { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.has_next).toBe(true);
      expect(result.next_cursor).not.toBeNull();
      const decoded: unknown = JSON.parse(
        Buffer.from(result.next_cursor as string, 'base64').toString('utf8'),
      );
      expect(decoded).toMatchObject({
        created_at: FIXED_DATE.toISOString(),
        id: CLAIM_ID_2,
      });
    });

    it('decodes valid cursor and adds composite (created_at, id) < predicate', async () => {
      const cursorPayload = { created_at: FIXED_DATE.toISOString(), id: CLAIM_ID_1 };
      const cursor = Buffer.from(JSON.stringify(cursorPayload), 'utf8').toString('base64');
      query.mockResolvedValueOnce({ rows: [makeClaim({ id: CLAIM_ID_2 })] });

      const result = await listForModeration(pool, { cursor, limit: 5 });

      expect(result.items).toHaveLength(1);
      expect(result.has_next).toBe(false);
      const sql = query.mock.calls[0]?.[0] ?? '';
      const values = query.mock.calls[0]?.[1] as unknown[];
      expect(sql).toMatch(/\(lc\.created_at,\s*lc\.id\)\s*<\s*\(\$1::timestamptz,\s*\$2::uuid\)/);
      expect(values[0]).toBe(FIXED_DATE.toISOString());
      expect(values[1]).toBe(CLAIM_ID_1);
    });

    it('treats malformed admin cursor as no cursor (no throw)', async () => {
      query.mockResolvedValueOnce({ rows: [makeClaim()] });

      const result = await listForModeration(pool, { cursor: 'not-base64-json!', limit: 5 });

      expect(result.items).toHaveLength(1);
      const sql = query.mock.calls[0]?.[0] ?? '';
      expect(sql).not.toMatch(/\(lc\.created_at,\s*lc\.id\)\s*</);
    });
  });

  describe('transitionStatus', () => {
    interface MockClient {
      query: MockQuery;
      release: jest.Mock;
    }
    function makeTxPool(): { pool: pg.Pool; client: MockClient } {
      const clientQuery = jest.fn() as MockQuery;
      const release = jest.fn();
      const client: MockClient = { query: clientQuery, release };
      const pool = {
        connect: jest.fn(async () => client),
      } as unknown as pg.Pool;
      return { pool, client };
    }

    it('returns not_found when row lock yields no rows (rolls back)', async () => {
      const { pool, client } = makeTxPool();
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await transitionStatus(pool, CLAIM_ID_1, { toStatus: 'published' });

      expect(result).toEqual({ ok: false, reason: 'not_found' });
      const sqls = client.query.mock.calls.map((c) => c[0]);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[2]).toBe('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    it('blocks publish when trust_grade is E (rolls back)', async () => {
      const { pool, client } = makeTxPool();
      client.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: CLAIM_ID_1,
              trust_grade: 'E',
              status: 'draft',
              disclaimer_key: null,
              published_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await transitionStatus(pool, CLAIM_ID_1, { toStatus: 'published' });

      expect(result).toEqual({ ok: false, reason: 'grade_E_blocked' });
      const sqls = client.query.mock.calls.map((c) => c[0]);
      expect(sqls[2]).toBe('ROLLBACK');
    });

    it('blocks publish when trust_grade is D and disclaimer_key is null (rolls back)', async () => {
      const { pool, client } = makeTxPool();
      client.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: CLAIM_ID_1,
              trust_grade: 'D',
              status: 'draft',
              disclaimer_key: null,
              published_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await transitionStatus(pool, CLAIM_ID_1, { toStatus: 'published' });

      expect(result).toEqual({ ok: false, reason: 'grade_D_requires_disclaimer' });
    });

    it('publishes D-grade claim when disclaimer_key supplied and sets published_at on first publish', async () => {
      const { pool, client } = makeTxPool();
      const updated = makeClaim({ status: 'published', trust_grade: 'D', disclaimer_key: 'general_health' });
      client.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: CLAIM_ID_1,
              trust_grade: 'D',
              status: 'draft',
              disclaimer_key: null,
              published_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await transitionStatus(pool, CLAIM_ID_1, {
        toStatus: 'published',
        disclaimer_key: 'general_health',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.claim.status).toBe('published');
      const updateSql = client.query.mock.calls[2]?.[0] ?? '';
      expect(updateSql).toMatch(/SET status = \$2/);
      expect(updateSql).toMatch(/disclaimer_key = \$3/);
      expect(updateSql).toMatch(/published_at = NOW\(\)/);
      const updateParams = client.query.mock.calls[2]?.[1] as unknown[];
      expect(updateParams).toEqual([CLAIM_ID_1, 'published', 'general_health']);
      const sqls = client.query.mock.calls.map((c) => c[0]);
      expect(sqls[3]).toBe('COMMIT');
    });

    it('preserves existing published_at when re-publishing (no NOW() override)', async () => {
      const { pool, client } = makeTxPool();
      const updated = makeClaim({ status: 'published' });
      client.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: CLAIM_ID_1,
              trust_grade: 'B',
              status: 'archived',
              disclaimer_key: null,
              published_at: FIXED_DATE,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await transitionStatus(pool, CLAIM_ID_1, { toStatus: 'published' });

      expect(result.ok).toBe(true);
      const updateSql = client.query.mock.calls[2]?.[0] ?? '';
      expect(updateSql).not.toMatch(/published_at = NOW\(\)/);
    });

    it('archives published claim without trust_grade gate', async () => {
      const { pool, client } = makeTxPool();
      const updated = makeClaim({ status: 'archived' });
      client.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: CLAIM_ID_1,
              trust_grade: 'E',
              status: 'published',
              disclaimer_key: null,
              published_at: FIXED_DATE,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await transitionStatus(pool, CLAIM_ID_1, { toStatus: 'archived' });

      expect(result.ok).toBe(true);
    });

    it('rolls back and rethrows when UPDATE fails', async () => {
      const { pool, client } = makeTxPool();
      client.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: CLAIM_ID_1,
              trust_grade: 'B',
              status: 'draft',
              disclaimer_key: null,
              published_at: null,
            },
          ],
        })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        transitionStatus(pool, CLAIM_ID_1, { toStatus: 'published' }),
      ).rejects.toThrow('boom');
      const sqls = client.query.mock.calls.map((c) => c[0]);
      expect(sqls[sqls.length - 1]).toBe('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('setHealthClaim', () => {
    let pool: pg.Pool;
    let query: MockQuery;

    beforeEach(() => {
      ({ pool, query } = makePool());
    });

    it('updates is_health_claim and returns claim', async () => {
      const updated = makeClaim({ is_health_claim: true });
      query.mockResolvedValueOnce({ rows: [updated] });

      const result = await setHealthClaim(pool, CLAIM_ID_1, true);

      expect(result?.is_health_claim).toBe(true);
      const sql = query.mock.calls[0]?.[0] ?? '';
      expect(sql).toMatch(/SET is_health_claim = \$2/);
      expect(query.mock.calls[0]?.[1]).toEqual([CLAIM_ID_1, true]);
    });

    it('returns null when claim row is absent', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const result = await setHealthClaim(pool, CLAIM_ID_1, false);
      expect(result).toBeNull();
    });
  });
});
