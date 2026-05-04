import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';
import {
  findById,
  listByCelebrity,
  listFeed,
  findSourcesByClaimId,
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
});
