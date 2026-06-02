import { jest, describe, it, expect } from '@jest/globals';
import type pg from 'pg';

import {
  createClaim,
  updateClaim,
  findByIdAdmin,
  resolveCelebrityIdBySlug,
  resolveBaseDietIdByCelebSlug,
  getCelebrityDisplayName,
} from '../../src/repositories/lifestyle-claim.repository.js';

// content-service repo 의 admin write 경로(createClaim/updateClaim/resolvers)를 mock pg pool 로
// 직접 검증한다(실제 DB 없이 SQL-build/트랜잭션 흐름 커버). 라우트 테스트는 repo 를 mock 하므로
// 이 파일이 repo 코드 자체의 커버리지를 담당한다.

const claimRow = {
  id: 'c1',
  celebrity_id: 'cel1',
  claim_type: 'food',
  headline: 'h',
  body: null,
  trust_grade: 'B',
  primary_source_url: null,
  verified_by: null,
  last_verified_at: null,
  is_health_claim: false,
  disclaimer_key: null,
  base_diet_id: null,
  tags: ['t'],
  status: 'draft',
  published_at: null,
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  story: null,
};

const sourceRow = {
  id: 's1',
  claim_id: 'c1',
  source_type: 'interview',
  outlet: 'People',
  url: null,
  published_date: null,
  excerpt: null,
  is_primary: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
};

function makePool() {
  const client = {
    query: jest.fn(async (sql: string) => {
      if (/INSERT INTO lifestyle_claims/.test(sql)) return { rows: [claimRow] };
      if (/UPDATE lifestyle_claims/.test(sql)) return { rows: [claimRow] };
      if (/story[\s\S]*FROM lifestyle_claims/.test(sql)) return { rows: [claimRow] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = {
    connect: jest.fn(async () => client),
    query: jest.fn(async (sql: string) => {
      if (/FROM claim_sources/.test(sql)) return { rows: [sourceRow] };
      if (/SELECT id FROM celebrities/.test(sql)) return { rows: [{ id: 'cel1' }] };
      if (/SELECT bd\.id/.test(sql)) return { rows: [{ id: 'bd1' }] };
      if (/SELECT display_name/.test(sql)) return { rows: [{ display_name: 'Cameron Diaz' }] };
      if (/story[\s\S]*FROM lifestyle_claims/.test(sql)) return { rows: [claimRow] };
      return { rows: [] };
    }),
  };
  return { pool: pool as unknown as pg.Pool, client };
}

describe('lifestyle-claim repository — admin write', () => {
  it('createClaim runs in a transaction and returns claim + sources', async () => {
    const { pool, client } = makePool();
    const result = await createClaim(pool, {
      celebrity_id: 'cel1',
      claim_type: 'food',
      headline: 'h',
      trust_grade: 'B',
      is_health_claim: true,
      tags: ['t'],
      status: 'published',
      story: { hook: { headline: 'x', sub: 'y' } } as never,
      sources: [{ source_type: 'interview', outlet: 'People', is_primary: true }],
    });
    expect(result.id).toBe('c1');
    expect(result.sources).toHaveLength(1);
    const calls = client.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes('BEGIN'))).toBe(true);
    expect(calls.some((s) => s.includes('INSERT INTO lifestyle_claims'))).toBe(true);
    expect(calls.some((s) => s.includes('INSERT INTO claim_sources'))).toBe(true);
    expect(calls.some((s) => s.includes('COMMIT'))).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('updateClaim builds a dynamic SET and replaces sources when provided', async () => {
    const { pool, client } = makePool();
    const result = await updateClaim(pool, 'c1', {
      headline: 'new',
      story: { hook: { headline: 'x', sub: 'y' } } as never,
      sources: [{ source_type: 'article', outlet: 'Vogue', is_primary: true }],
    });
    expect(result?.id).toBe('c1');
    const calls = client.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => /UPDATE lifestyle_claims/.test(s))).toBe(true);
    expect(calls.some((s) => /DELETE FROM claim_sources/.test(s))).toBe(true);
  });

  it('updateClaim with no fields falls back to a SELECT existence check', async () => {
    const { pool, client } = makePool();
    const result = await updateClaim(pool, 'c1', {});
    expect(result?.id).toBe('c1');
    const calls = client.query.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => /UPDATE lifestyle_claims/.test(s))).toBe(false);
    expect(calls.some((s) => /SELECT[\s\S]*FROM lifestyle_claims/.test(s))).toBe(true);
  });

  it('findByIdAdmin includes story', async () => {
    const { pool } = makePool();
    const result = await findByIdAdmin(pool, 'c1');
    expect(result?.id).toBe('c1');
    expect(result).toHaveProperty('story');
    expect(result?.sources).toHaveLength(1);
  });

  it('resolvers return ids / display_name', async () => {
    const { pool } = makePool();
    expect(await resolveCelebrityIdBySlug(pool, 'cameron-diaz')).toBe('cel1');
    expect(await resolveBaseDietIdByCelebSlug(pool, 'cameron-diaz')).toBe('bd1');
    expect(await getCelebrityDisplayName(pool, 'cel1')).toBe('Cameron Diaz');
  });
});
