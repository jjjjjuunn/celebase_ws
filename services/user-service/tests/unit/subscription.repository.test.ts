import { describe, it, expect, jest } from '@jest/globals';
import type pg from 'pg';
import {
  findTierByUserId,
  findSubscriptionStateByUserId,
} from '../../src/repositories/subscription.repository.js';

function makeMockPool(rows: unknown[]): pg.Pool {
  return {
    query: jest.fn().mockResolvedValue({ rows }) as unknown,
  } as unknown as pg.Pool;
}

describe('findTierByUserId', () => {
  it('returns tier from users.subscription_tier column', async () => {
    const pool = makeMockPool([{ subscription_tier: 'premium' }]);
    const result = await findTierByUserId(pool, 'user-123');
    expect(result).toEqual({ tier: 'premium' });
  });

  it('defaults tier to free when user row is missing', async () => {
    const pool = makeMockPool([]);
    const result = await findTierByUserId(pool, 'unknown-user');
    expect(result).toEqual({ tier: 'free' });
  });

  it('queries users table (not subscriptions table)', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query: mockQuery } as unknown as pg.Pool;
    await findTierByUserId(pool, 'user-456');
    const [sql] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/FROM users/i);
    expect(sql).not.toMatch(/FROM subscriptions/i);
  });
});

describe('findSubscriptionStateByUserId', () => {
  it('returns tier + bio_profiles.created_at as the trial anchor', async () => {
    const created = new Date('2026-05-20T00:00:00.000Z');
    const pool = makeMockPool([
      { subscription_tier: 'free', bio_created_at: created },
    ]);
    const result = await findSubscriptionStateByUserId(pool, 'user-123');
    expect(result).toEqual({ tier: 'free', bioCreatedAt: created });
  });

  it('returns null bioCreatedAt when onboarding is incomplete', async () => {
    const pool = makeMockPool([
      { subscription_tier: 'free', bio_created_at: null },
    ]);
    const result = await findSubscriptionStateByUserId(pool, 'user-123');
    expect(result).toEqual({ tier: 'free', bioCreatedAt: null });
  });

  it('defaults to free + null anchor when user row is missing', async () => {
    const pool = makeMockPool([]);
    const result = await findSubscriptionStateByUserId(pool, 'unknown');
    expect(result).toEqual({ tier: 'free', bioCreatedAt: null });
  });

  it('LEFT JOINs bio_profiles to read the trial anchor', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query: mockQuery } as unknown as pg.Pool;
    await findSubscriptionStateByUserId(pool, 'user-456');
    const [sql] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/LEFT JOIN bio_profiles/i);
    expect(sql).toMatch(/created_at/i);
  });
});
