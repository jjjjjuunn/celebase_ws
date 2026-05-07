import { jest } from '@jest/globals';
import type pg from 'pg';
import type { Subscription } from '@celebbase/shared-types';
import {
  upsertRevenuecatSubscription,
  findByRevenuecatSubscriptionId,
  findByRevenuecatAppUserId,
} from '../../src/repositories/subscription.repository.js';

type QueryResult = { rows: unknown[]; rowCount: number };
type QueryFn = (...args: unknown[]) => Promise<QueryResult>;

interface MockClient {
  query: jest.MockedFunction<QueryFn>;
  release: jest.MockedFunction<() => void>;
}

function makeMockClient(results: Array<QueryResult | Error>): MockClient {
  const query = jest.fn<QueryFn>();
  for (const r of results) {
    if (r instanceof Error) {
      query.mockRejectedValueOnce(r);
    } else {
      query.mockResolvedValueOnce(r);
    }
  }
  return { query, release: jest.fn() };
}

function makeMockPoolWithConnect(client: MockClient): pg.Pool {
  return {
    connect: jest.fn<() => Promise<pg.PoolClient>>().mockResolvedValue(client as unknown as pg.PoolClient),
  } as unknown as pg.Pool;
}

function makeMockPoolDirect(result: QueryResult): pg.Pool {
  return {
    query: jest.fn<QueryFn>().mockResolvedValue(result),
  } as unknown as pg.Pool;
}

const SAMPLE_ROW: Subscription = {
  id: '11111111-1111-7111-8111-111111111111',
  user_id: '22222222-2222-7222-8222-222222222222',
  tier: 'premium',
  provider: 'revenuecat',
  stripe_subscription_id: null,
  stripe_customer_id: null,
  revenuecat_subscription_id: 'rc-tx-001',
  revenuecat_app_user_id: 'rc-user-abc',
  status: 'active',
  current_period_start: new Date('2026-05-01T00:00:00Z'),
  current_period_end: new Date('2026-06-01T00:00:00Z'),
  cancel_at_period_end: false,
  quota_override: {},
  created_at: new Date('2026-05-01T00:00:00Z'),
  updated_at: new Date('2026-05-01T00:00:00Z'),
};

const PARAMS = {
  userId: SAMPLE_ROW.user_id,
  revenuecatSubscriptionId: 'rc-tx-001',
  revenuecatAppUserId: 'rc-user-abc',
  tier: 'premium' as const,
  status: 'active' as const,
  currentPeriodStart: new Date('2026-05-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
};

describe('upsertRevenuecatSubscription — happy path', () => {
  it('inserts new subscription, expires no priors, commits', async () => {
    const client = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // UPDATE expires (no priors)
      { rows: [SAMPLE_ROW], rowCount: 1 }, // INSERT
      { rows: [], rowCount: 0 }, // COMMIT
    ]);
    const pool = makeMockPoolWithConnect(client);

    const result = await upsertRevenuecatSubscription(pool, PARAMS);

    expect(result).toEqual(SAMPLE_ROW);
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[0]?.[0]).toBe('BEGIN');
    expect(client.query.mock.calls[3]?.[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('expires prior RC subscription before insert, then commits', async () => {
    const client = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 1 }, // UPDATE expires 1 prior
      { rows: [SAMPLE_ROW], rowCount: 1 }, // INSERT
      { rows: [], rowCount: 0 }, // COMMIT
    ]);
    const pool = makeMockPoolWithConnect(client);

    const result = await upsertRevenuecatSubscription(pool, PARAMS);
    expect(result).toEqual(SAMPLE_ROW);

    const updateCall = client.query.mock.calls[1];
    const updateSql = updateCall?.[0] as string;
    const updateArgs = updateCall?.[1] as unknown[];
    expect(updateSql).toMatch(/UPDATE subscriptions/);
    expect(updateSql).toMatch(/provider = 'revenuecat'/);
    expect(updateSql).toMatch(/IS DISTINCT FROM \$2/);
    expect(updateArgs).toEqual([PARAMS.userId, PARAMS.revenuecatSubscriptionId]);
  });

  it('passes provider=revenuecat and ON CONFLICT (revenuecat_subscription_id) in INSERT', async () => {
    const client = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // UPDATE
      { rows: [SAMPLE_ROW], rowCount: 1 }, // INSERT
      { rows: [], rowCount: 0 }, // COMMIT
    ]);
    const pool = makeMockPoolWithConnect(client);

    await upsertRevenuecatSubscription(pool, PARAMS);

    const insertCall = client.query.mock.calls[2];
    const insertSql = insertCall?.[0] as string;
    const insertArgs = insertCall?.[1] as unknown[];
    expect(insertSql).toMatch(/INSERT INTO subscriptions/);
    expect(insertSql).toMatch(/'revenuecat'/);
    expect(insertSql).toMatch(/ON CONFLICT \(revenuecat_subscription_id\)/);
    expect(insertSql).toMatch(/WHERE provider = 'revenuecat' AND revenuecat_subscription_id IS NOT NULL/);
    expect(insertArgs).toEqual([
      PARAMS.userId,
      PARAMS.revenuecatSubscriptionId,
      PARAMS.revenuecatAppUserId,
      PARAMS.tier,
      PARAMS.status,
      PARAMS.currentPeriodStart,
      PARAMS.currentPeriodEnd,
      false, // cancelAtPeriodEnd default
    ]);
  });

  it('passes cancelAtPeriodEnd=true when explicitly provided', async () => {
    const client = makeMockClient([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [SAMPLE_ROW], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);
    const pool = makeMockPoolWithConnect(client);

    await upsertRevenuecatSubscription(pool, { ...PARAMS, cancelAtPeriodEnd: true });

    const insertArgs = client.query.mock.calls[2]?.[1] as unknown[];
    expect(insertArgs[7]).toBe(true);
  });
});

describe('upsertRevenuecatSubscription — error paths', () => {
  it('rolls back when INSERT throws and rethrows the error', async () => {
    const insertErr = new Error('unique violation');
    const client = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // UPDATE
      insertErr, // INSERT throws
      { rows: [], rowCount: 0 }, // ROLLBACK
    ]);
    const pool = makeMockPoolWithConnect(client);

    await expect(upsertRevenuecatSubscription(pool, PARAMS)).rejects.toThrow('unique violation');

    const lastCall = client.query.mock.calls[3];
    expect(lastCall?.[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('throws when INSERT returns no rows (and releases the client)', async () => {
    // Implementation flow: BEGIN → UPDATE → INSERT(empty) → COMMIT → throw → catch → ROLLBACK
    // (the post-COMMIT ROLLBACK is a no-op but the impl still issues it; both must be mocked)
    const client = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // UPDATE
      { rows: [], rowCount: 0 }, // INSERT returns nothing — guarded
      { rows: [], rowCount: 0 }, // COMMIT
      { rows: [], rowCount: 0 }, // ROLLBACK (best-effort after COMMIT)
    ]);
    const pool = makeMockPoolWithConnect(client);

    await expect(upsertRevenuecatSubscription(pool, PARAMS)).rejects.toThrow(
      'upsertRevenuecatSubscription: no row returned after upsert',
    );

    expect(client.query.mock.calls[3]?.[0]).toBe('COMMIT');
    expect(client.query.mock.calls[4]?.[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('releases the client even when BEGIN throws', async () => {
    const beginErr = new Error('connection lost');
    const client = makeMockClient([
      beginErr, // BEGIN throws — caught by outer try, then ROLLBACK is attempted
      { rows: [], rowCount: 0 }, // ROLLBACK (best effort)
    ]);
    const pool = makeMockPoolWithConnect(client);

    await expect(upsertRevenuecatSubscription(pool, PARAMS)).rejects.toThrow('connection lost');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('findByRevenuecatSubscriptionId', () => {
  it('returns subscription row when found', async () => {
    const pool = makeMockPoolDirect({ rows: [SAMPLE_ROW], rowCount: 1 });
    const result = await findByRevenuecatSubscriptionId(pool, 'rc-tx-001');
    expect(result).toEqual(SAMPLE_ROW);

    const queryFn = pool.query as unknown as jest.MockedFunction<QueryFn>;
    expect(queryFn).toHaveBeenCalledTimes(1);
    const sql = queryFn.mock.calls[0]?.[0] as string;
    const args = queryFn.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/provider = 'revenuecat'/);
    expect(sql).toMatch(/revenuecat_subscription_id = \$1/);
    expect(args).toEqual(['rc-tx-001']);
  });

  it('returns null when no rows match', async () => {
    const pool = makeMockPoolDirect({ rows: [], rowCount: 0 });
    const result = await findByRevenuecatSubscriptionId(pool, 'rc-missing');
    expect(result).toBeNull();
  });
});

describe('findByRevenuecatAppUserId', () => {
  it('returns most-recent subscription row when found', async () => {
    const pool = makeMockPoolDirect({ rows: [SAMPLE_ROW], rowCount: 1 });
    const result = await findByRevenuecatAppUserId(pool, 'rc-user-abc');
    expect(result).toEqual(SAMPLE_ROW);

    const queryFn = pool.query as unknown as jest.MockedFunction<QueryFn>;
    const sql = queryFn.mock.calls[0]?.[0] as string;
    const args = queryFn.mock.calls[0]?.[1] as unknown[];
    expect(sql).toMatch(/provider = 'revenuecat'/);
    expect(sql).toMatch(/revenuecat_app_user_id = \$1/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(sql).toMatch(/LIMIT 1/);
    expect(args).toEqual(['rc-user-abc']);
  });

  it('returns null when no rows match', async () => {
    const pool = makeMockPoolDirect({ rows: [], rowCount: 0 });
    const result = await findByRevenuecatAppUserId(pool, 'rc-user-missing');
    expect(result).toBeNull();
  });
});
