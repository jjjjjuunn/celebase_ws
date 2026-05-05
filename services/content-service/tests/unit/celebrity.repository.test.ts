import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';
import { deactivate } from '../../src/repositories/celebrity.repository.js';

interface QueryResult<T> {
  rows: T[];
}

type MockQuery = jest.Mock<(sql: string, values?: unknown[]) => Promise<QueryResult<unknown>>>;

function makePool(): { pool: pg.Pool; query: MockQuery } {
  const query = jest.fn() as MockQuery;
  const pool = { query } as unknown as pg.Pool;
  return { pool, query };
}

const CELEBRITY_ID = '01000000-0000-7000-8000-000000000001';

function makeCelebrity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CELEBRITY_ID,
    slug: 'jane-doe',
    display_name: 'Jane Doe',
    short_bio: null,
    avatar_url: 'https://cdn.example.com/jane.webp',
    cover_image_url: null,
    category: 'general',
    tags: [],
    is_featured: false,
    sort_order: 0,
    is_active: false,
    created_at: new Date('2026-04-01T12:00:00.000Z'),
    updated_at: new Date('2026-04-01T12:00:00.000Z'),
    ...overrides,
  };
}

describe('celebrity.repository.deactivate', () => {
  let pool: pg.Pool;
  let query: MockQuery;

  beforeEach(() => {
    ({ pool, query } = makePool());
  });

  it('updates is_active to FALSE only when currently active and returns the row', async () => {
    query.mockResolvedValueOnce({ rows: [makeCelebrity({ is_active: false })] });

    const result = await deactivate(pool, CELEBRITY_ID);

    expect(result).not.toBeNull();
    expect(result?.is_active).toBe(false);
    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toMatch(/UPDATE celebrities/);
    expect(sql).toMatch(/SET is_active = FALSE/);
    expect(sql).toMatch(/updated_at = NOW\(\)/);
    expect(sql).toMatch(/WHERE id = \$1 AND is_active = TRUE/);
    expect(sql).toMatch(/RETURNING \*/);
    expect(query.mock.calls[0]?.[1]).toEqual([CELEBRITY_ID]);
  });

  it('returns null when celebrity does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await deactivate(pool, CELEBRITY_ID);
    expect(result).toBeNull();
  });

  it('returns null when celebrity already inactive (idempotent — no double-cascade)', async () => {
    // 동일 id 에 대해 두 번 호출 — 두 번째는 RETURNING 이 빈 rows
    query
      .mockResolvedValueOnce({ rows: [makeCelebrity({ is_active: false })] })
      .mockResolvedValueOnce({ rows: [] });

    const first = await deactivate(pool, CELEBRITY_ID);
    const second = await deactivate(pool, CELEBRITY_ID);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
