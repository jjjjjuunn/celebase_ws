import { jest, describe, it, expect } from '@jest/globals';
import type pg from 'pg';
import {
  findAndUpdateCognitoSubByEmail,
  findByCognitoSub,
  findByEmail,
  findById,
  updateUser,
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

// FIX-USER-PATCH-PARAM-INDEX-001: updateUser built the SET clause with `$${idx+2}`
// and the WHERE with `$${len+2}`, so $1 was never referenced and the WHERE
// pointed at an out-of-range param → PG 42P18 ("could not determine data type
// of parameter $1") on every PATCH /users/me. These assert the placeholder
// numbers form a contiguous 1..values.length with the id bound last.
function placeholderNumbers(text: string): number[] {
  return [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
}

describe('user.repository.updateUser — parameterized SQL integrity', () => {
  it('single field: $1 = value, $2 = id', async () => {
    const pool = makePool({ rows: [baseUser] });
    await updateUser(pool, 'u1', { display_name: 'New Name' });
    const [text, values] = (pool.query as unknown as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(text).toBe(
      'UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    );
    expect(values).toEqual(['New Name', 'u1']);
    const nums = placeholderNumbers(text);
    expect(Math.max(...nums)).toBe(values.length); // no out-of-range placeholder
    expect(new Set(nums)).toEqual(new Set([1, 2])); // every value referenced, no gap
  });

  it('multiple fields: contiguous $1..$N, id is the last placeholder', async () => {
    const pool = makePool({ rows: [baseUser] });
    await updateUser(pool, 'u1', {
      display_name: 'New Name',
      preferred_celebrity_slug: 'ariana-grande',
    });
    const [text, values] = (pool.query as unknown as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(values).toEqual(['New Name', 'ariana-grande', 'u1']);
    expect(text).toContain('WHERE id = $3');
    const nums = placeholderNumbers(text);
    expect(Math.max(...nums)).toBe(values.length);
    expect(new Set(nums)).toEqual(new Set([1, 2, 3]));
  });

  it('nullable field binds null at $1', async () => {
    const pool = makePool({ rows: [baseUser] });
    await updateUser(pool, 'u1', { preferred_celebrity_slug: null });
    const [text, values] = (pool.query as unknown as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(text).toBe(
      'UPDATE users SET preferred_celebrity_slug = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    );
    expect(values).toEqual([null, 'u1']);
  });

  it('rejects unknown columns', async () => {
    const pool = makePool({ rows: [baseUser] });
    await expect(
      updateUser(pool, 'u1', { evil: 'x' } as unknown as { display_name: string }),
    ).rejects.toThrow('Unexpected column');
  });
});
