import { jest, describe, it, expect } from '@jest/globals';
import type pg from 'pg';
import {
  findAndUpdateCognitoSubByEmail,
  findByCognitoSub,
  findByEmail,
  findById,
} from '../../src/repositories/user.repository.js';

const baseUser = {
  id: 'u1',
  cognito_sub: 'dev-legacy',
  email: 'legacy@example.com',
  display_name: 'Legacy',
  avatar_url: null,
  subscription_tier: 'free',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

function makePool(result: { rows: unknown[] } | Error): pg.Pool {
  const query = jest.fn(() => {
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  });
  return { query } as unknown as pg.Pool;
}

describe('user.repository.findAndUpdateCognitoSubByEmail', () => {
  it('returns the updated user when a dev-seeded row matches', async () => {
    const updated = { ...baseUser, cognito_sub: 'cognito-real' };
    const pool = makePool({ rows: [updated] });

    const result = await findAndUpdateCognitoSubByEmail(
      pool,
      'legacy@example.com',
      'cognito-real',
    );

    expect(result).toEqual(updated);
    const query = (pool.query as unknown as jest.Mock).mock.calls[0]![0] as string;
    expect(query).toContain("cognito_sub LIKE 'dev-%'");
    expect(query).toContain('UPDATE users');
    expect(query).toContain('RETURNING *');
  });

  it('returns null when no dev-seeded row matches', async () => {
    const pool = makePool({ rows: [] });

    const result = await findAndUpdateCognitoSubByEmail(
      pool,
      'ghost@example.com',
      'cognito-new',
    );

    expect(result).toBeNull();
  });

  it('returns null on unique_violation (concurrent race claimed the sub)', async () => {
    const err = Object.assign(new Error('duplicate key'), { code: '23505' });
    const pool = makePool(err);

    const result = await findAndUpdateCognitoSubByEmail(
      pool,
      'legacy@example.com',
      'cognito-real',
    );

    expect(result).toBeNull();
  });

  it('rethrows unexpected DB errors', async () => {
    const err = Object.assign(new Error('connection refused'), { code: '08001' });
    const pool = makePool(err);

    await expect(
      findAndUpdateCognitoSubByEmail(pool, 'x@example.com', 'sub'),
    ).rejects.toThrow('connection refused');
  });
});

describe('user.repository basic queries', () => {
  it('findById returns the first row or null', async () => {
    const pool = makePool({ rows: [baseUser] });
    expect(await findById(pool, 'u1')).toEqual(baseUser);
    const empty = makePool({ rows: [] });
    expect(await findById(empty, 'u1')).toBeNull();
  });

  it('findByEmail returns the first row or null', async () => {
    const pool = makePool({ rows: [baseUser] });
    expect(await findByEmail(pool, 'legacy@example.com')).toEqual(baseUser);
  });

  it('findByCognitoSub returns the first row or null', async () => {
    const pool = makePool({ rows: [baseUser] });
    expect(await findByCognitoSub(pool, 'dev-legacy')).toEqual(baseUser);
  });
});
