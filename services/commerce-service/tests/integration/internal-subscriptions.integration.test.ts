// IMPL-MOBILE-SUB-SYNC-001b: BFF -> commerce pull-sync internal route.
//
// 검증 범위:
// - happy path (active premium entitlement → upsert + tier sync → 200)
// - no entitlement → free
// - RevenuecatUnavailableError → 502 envelope
// - body validation 400
// - Internal JWT 가드: 누락/audience 불일치 → 401
// - idempotency: user-service 409 DUPLICATE_REQUEST → 정상 200 (sync 상태 동일)

import { jest } from '@jest/globals';
import { SignJWT } from 'jose';
import type pg from 'pg';
import { RevenuecatUnavailableError } from '../../src/adapters/revenuecat.adapter.js';
import type { RevenuecatSubscriberSnapshot } from '../../src/adapters/revenuecat.adapter.js';

const INTERNAL_SECRET = 'test-internal-secret-32-chars-pad';
process.env['INTERNAL_JWT_SECRET'] = INTERNAL_SECRET;

const mockUpsertRevenuecat = jest.fn<() => Promise<unknown>>();
jest.unstable_mockModule('../../src/repositories/subscription.repository.js', () => ({
  upsertRevenuecatSubscription: mockUpsertRevenuecat,
  upsertSubscription: jest.fn(),
  findByUserId: jest.fn(),
  findByStripeSubscriptionId: jest.fn(),
  findByRevenuecatSubscriptionId: jest.fn(),
  findByRevenuecatAppUserId: jest.fn(),
}));

const { default: Fastify } = await import('fastify');
const { internalSubscriptionsRoutes } = await import('../../src/routes/internal-subscriptions.routes.js');
const { registerInternalJwtAuth } = await import('../../src/middleware/internal-jwt.js');
// handleWebhookEvent 는 별도 webhook 통합 테스트가 mock 으로 우회한 함수.
// SUB-SYNC-001b 가 전체 파일을 함께 import 하면서 backfill 으로 직접 호출
// 테스트를 추가 — coverage 임계값 충족 + webhook entry-point 회귀 보호.
const { handleWebhookEvent, resetSyncCacheForTest } = await import('../../src/services/revenuecat-sync.service.js');

interface CapturedLog {
  msg?: string;
  user_id?: string;
  tier?: string;
  source?: string;
  reason?: string;
  [key: string]: unknown;
}

function makeCaptureLogger(captured: CapturedLog[]): unknown {
  const logger = {
    level: 'info',
    silent: () => undefined,
    info: (obj: unknown): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    warn: (obj: unknown): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    error: (obj: unknown): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    debug: () => undefined,
    trace: () => undefined,
    fatal: () => undefined,
    child: (): unknown => logger,
  };
  return logger;
}

interface BuildOptions {
  getSubscriber?: jest.Mock<(appUserId: string) => Promise<RevenuecatSubscriberSnapshot>>;
  syncTier?: jest.Mock<() => Promise<void>>;
}

function buildApp(captured: CapturedLog[], opts: BuildOptions = {}): ReturnType<typeof Fastify> {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerInstance: makeCaptureLogger(captured) as any,
    disableRequestLogging: true,
  });

  registerInternalJwtAuth(app);

  const stubPool = {} as pg.Pool;
  const adapter = {
    getSubscriber: opts.getSubscriber ?? jest.fn(),
  };
  const userClient = {
    syncTier: opts.syncTier ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  void app.register((scope, _o, done) => {
    void internalSubscriptionsRoutes(scope, {
      pool: stubPool,
      revenuecatConfig: {
        enabled: true,
        apiKey: 'test-key',
        apiBaseUrl: 'https://api.revenuecat.com/v1',
        productTierMap: { celebbase_premium_monthly: 'premium' },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      revenuecatAdapter: adapter as any,
      userClient,
    }).then(done);
  });

  return app;
}

async function makeInternalToken(audience: string = 'commerce-service:internal'): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60s')
    .setIssuer('celebbase-internal')
    .setAudience(audience)
    .setJti(`jti-${String(Date.now())}-${Math.random().toString(36).slice(2)}`)
    .sign(new TextEncoder().encode(INTERNAL_SECRET));
}

const validUserId = '01900000-0000-7000-8000-000000000001';

const activeEntitlementSnapshot: RevenuecatSubscriberSnapshot = {
  app_user_id: validUserId,
  entitlements: {
    premium: {
      product_identifier: 'celebbase_premium_monthly',
      is_active: true,
      purchase_date: '2026-04-01T00:00:00Z',
      expires_date: '2026-06-01T00:00:00Z',
      billing_issues_detected_at: null,
      unsubscribe_detected_at: null,
    },
  },
};

const emptySnapshot: RevenuecatSubscriberSnapshot = {
  app_user_id: validUserId,
  entitlements: {},
};

describe('POST /internal/subscriptions/refresh-from-revenuecat', () => {
  beforeEach(() => {
    mockUpsertRevenuecat.mockReset();
    mockUpsertRevenuecat.mockResolvedValue({});
    // CHORE-SUB-CACHE-001: clear sync cache + in-flight maps so each test runs
    // against an empty cache.
    resetSyncCacheForTest();
  });

  it('happy path: active premium entitlement → 200 + tier=premium + upsert + syncTier called', async () => {
    const captured: CapturedLog[] = [];
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(activeEntitlementSnapshot);
    const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const app = buildApp(captured, { getSubscriber, syncTier });
    await app.ready();

    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'purchase' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user_id).toBe(validUserId);
    expect(body.tier).toBe('premium');
    expect(body.status).toBe('active');
    expect(body.source).toBe('purchase');
    expect(body.current_period_end).toBe('2026-06-01T00:00:00.000Z');

    expect(getSubscriber).toHaveBeenCalledWith(validUserId);
    expect(mockUpsertRevenuecat).toHaveBeenCalledTimes(1);
    expect(syncTier).toHaveBeenCalledTimes(1);
    const syncArgs = syncTier.mock.calls[0];
    expect(syncArgs?.[0]).toBe(validUserId);
    expect(syncArgs?.[1]).toBe('premium');

    await app.close();
  });

  it('no entitlement → tier=free, no upsert', async () => {
    const captured: CapturedLog[] = [];
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(emptySnapshot);
    const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const app = buildApp(captured, { getSubscriber, syncTier });
    await app.ready();

    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'app_open' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('free');
    expect(mockUpsertRevenuecat).not.toHaveBeenCalled();
    expect(syncTier).toHaveBeenCalledWith(validUserId, 'free', expect.objectContaining({ idempotencyKey: expect.any(String) }));

    await app.close();
  });

  it('RevenuecatUnavailableError → 502 REVENUECAT_UNAVAILABLE', async () => {
    const captured: CapturedLog[] = [];
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockRejectedValue(
      new RevenuecatUnavailableError('upstream 503'),
    );
    const app = buildApp(captured, { getSubscriber });
    await app.ready();

    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'manual' },
    });

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error.code).toBe('REVENUECAT_UNAVAILABLE');

    await app.close();
  });

  it('validation: missing user_id → 400', async () => {
    const app = buildApp([]);
    await app.ready();
    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { source: 'purchase' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('validation: invalid source → 400', async () => {
    const app = buildApp([]);
    await app.ready();
    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('internal JWT missing → 401 + getSubscriber not called', async () => {
    const captured: CapturedLog[] = [];
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>();
    const app = buildApp(captured, { getSubscriber });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'purchase' },
    });
    expect(res.statusCode).toBe(401);
    expect(getSubscriber).not.toHaveBeenCalled();
    await app.close();
  });

  it('internal JWT wrong audience → 401 + getSubscriber not called', async () => {
    const captured: CapturedLog[] = [];
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>();
    const app = buildApp(captured, { getSubscriber });
    await app.ready();
    const wrongAudToken = await makeInternalToken('user-service:internal');
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${wrongAudToken}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'purchase' },
    });
    expect(res.statusCode).toBe(401);
    expect(getSubscriber).not.toHaveBeenCalled();
    await app.close();
  });

  it('idempotency: user-service 409 DUPLICATE_REQUEST → silent skip + 200', async () => {
    const captured: CapturedLog[] = [];
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(activeEntitlementSnapshot);
    const syncTier = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('InternalClientError: 409 /internal/users/.../tier'));
    const app = buildApp(captured, { getSubscriber, syncTier });
    await app.ready();

    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'app_open' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('premium');

    await app.close();
  });

  it('unknown product (productTierMap drift) → tier=free', async () => {
    const captured: CapturedLog[] = [];
    const unknownProductSnapshot: RevenuecatSubscriberSnapshot = {
      app_user_id: validUserId,
      entitlements: {
        legacy: {
          product_identifier: 'celebbase_legacy_lifetime', // not in productTierMap
          is_active: true,
          purchase_date: '2026-04-01T00:00:00Z',
          expires_date: null,
          billing_issues_detected_at: null,
          unsubscribe_detected_at: null,
        },
      },
    };
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(unknownProductSnapshot);
    const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const app = buildApp(captured, { getSubscriber, syncTier });
    await app.ready();
    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'manual' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tier).toBe('free');
    expect(mockUpsertRevenuecat).not.toHaveBeenCalled();
    expect(syncTier).toHaveBeenCalledWith(validUserId, 'free', expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(captured.some((l) => l.product_identifier === 'celebbase_legacy_lifetime')).toBe(true);
    await app.close();
  });

  it('expired entitlement (expires_date in past) → status=expired, tier=free', async () => {
    const captured: CapturedLog[] = [];
    const expiredSnapshot: RevenuecatSubscriberSnapshot = {
      app_user_id: validUserId,
      entitlements: {
        premium: {
          product_identifier: 'celebbase_premium_monthly',
          is_active: false,
          purchase_date: '2025-01-01T00:00:00Z',
          expires_date: '2025-02-01T00:00:00Z',
          billing_issues_detected_at: null,
          unsubscribe_detected_at: null,
        },
      },
    };
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(expiredSnapshot);
    const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const app = buildApp(captured, { getSubscriber, syncTier });
    await app.ready();
    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'app_open' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tier).toBe('free'); // deriveUserTier(expired, premium) → free
    expect(body.status).toBe('expired');
    expect(syncTier).toHaveBeenCalledWith(validUserId, 'free', expect.any(Object));
    await app.close();
  });

  // CHORE-SUB-CACHE-001 — source-aware cache + single-flight
  describe('cache + single-flight (CHORE-SUB-CACHE-001)', () => {
    it('source=app_open: 2nd call within 60s hits cache → adapter called once', async () => {
      const captured: CapturedLog[] = [];
      const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(activeEntitlementSnapshot);
      const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const app = buildApp(captured, { getSubscriber, syncTier });
      await app.ready();
      const token1 = await makeInternalToken();
      const token2 = await makeInternalToken();

      const res1 = await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${token1}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'app_open' },
      });
      const res2 = await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${token2}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'app_open' },
      });

      expect(res1.statusCode).toBe(200);
      expect(res2.statusCode).toBe(200);
      // adapter called only once — 2nd request served from cache
      expect(getSubscriber).toHaveBeenCalledTimes(1);
      // syncTier called only once — cache short-circuits user-service sync too
      expect(syncTier).toHaveBeenCalledTimes(1);
      // upsert called only once
      expect(mockUpsertRevenuecat).toHaveBeenCalledTimes(1);
      // both responses have same tier
      expect(JSON.parse(res1.body).tier).toBe('premium');
      expect(JSON.parse(res2.body).tier).toBe('premium');
      await app.close();
    });

    it('source=purchase: bypasses cache → adapter called every time', async () => {
      const captured: CapturedLog[] = [];
      const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(activeEntitlementSnapshot);
      const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const app = buildApp(captured, { getSubscriber, syncTier });
      await app.ready();
      const token1 = await makeInternalToken();
      const token2 = await makeInternalToken();

      await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${token1}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'purchase' },
      });
      await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${token2}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'purchase' },
      });

      // purchase bypasses cache → adapter called twice
      expect(getSubscriber).toHaveBeenCalledTimes(2);
      await app.close();
    });

    it('purchase result populates cache → subsequent app_open hits cache', async () => {
      const captured: CapturedLog[] = [];
      const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(activeEntitlementSnapshot);
      const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const app = buildApp(captured, { getSubscriber, syncTier });
      await app.ready();
      const t1 = await makeInternalToken();
      const t2 = await makeInternalToken();

      // 1) purchase fetches fresh + populates cache
      await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${t1}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'purchase' },
      });
      // 2) app_open within 60s reuses cache
      await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${t2}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'app_open' },
      });

      expect(getSubscriber).toHaveBeenCalledTimes(1);
      await app.close();
    });

    it('cache is per-user-id: different user not served stale data', async () => {
      const captured: CapturedLog[] = [];
      const userBId = '01900000-0000-7000-8000-000000000002';
      const getSubscriber = jest.fn<(appUserId: string) => Promise<RevenuecatSubscriberSnapshot>>()
        .mockResolvedValueOnce(activeEntitlementSnapshot)
        .mockResolvedValueOnce({ ...activeEntitlementSnapshot, app_user_id: userBId });
      const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const app = buildApp(captured, { getSubscriber, syncTier });
      await app.ready();
      const t1 = await makeInternalToken();
      const t2 = await makeInternalToken();

      await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${t1}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'app_open' },
      });
      await app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${t2}`, 'content-type': 'application/json' },
        payload: { user_id: userBId, source: 'app_open' },
      });

      // Two distinct users → two distinct adapter calls
      expect(getSubscriber).toHaveBeenCalledTimes(2);
      expect(getSubscriber).toHaveBeenNthCalledWith(1, validUserId);
      expect(getSubscriber).toHaveBeenNthCalledWith(2, userBId);
      await app.close();
    });

    it('single-flight: concurrent same-user calls coalesce → adapter once', async () => {
      const captured: CapturedLog[] = [];
      // Slow adapter to simulate concurrent requests overlapping
      let resolveAdapter: (value: RevenuecatSubscriberSnapshot) => void;
      const adapterPromise = new Promise<RevenuecatSubscriberSnapshot>((r) => {
        resolveAdapter = r;
      });
      const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>()
        .mockReturnValue(adapterPromise);
      const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const app = buildApp(captured, { getSubscriber, syncTier });
      await app.ready();
      const t1 = await makeInternalToken();
      const t2 = await makeInternalToken();
      const t3 = await makeInternalToken();

      const p1 = app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${t1}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'app_open' },
      });
      const p2 = app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${t2}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'manual' },
      });
      const p3 = app.inject({
        method: 'POST',
        url: '/internal/subscriptions/refresh-from-revenuecat',
        headers: { authorization: `Bearer ${t3}`, 'content-type': 'application/json' },
        payload: { user_id: validUserId, source: 'app_open' },
      });

      // Now resolve adapter — all 3 should coalesce
      resolveAdapter!(activeEntitlementSnapshot);
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      expect(r3.statusCode).toBe(200);
      // Critical: adapter called exactly once across 3 concurrent requests
      expect(getSubscriber).toHaveBeenCalledTimes(1);
      // Each response carries its own source dimension
      expect(JSON.parse(r1.body).source).toBe('app_open');
      expect(JSON.parse(r2.body).source).toBe('manual');
      expect(JSON.parse(r3.body).source).toBe('app_open');
      await app.close();
    });
  });

  // handleWebhookEvent 직접 호출 — webhook 엔트리 포인트의 backfill 회귀 보호
  // (SUB-SYNC-001 의 webhook 통합 테스트는 이 함수를 mock 처리해 실제 코드 경로 미실행).
  describe('handleWebhookEvent backfill (covers webhook code path)', () => {
    const stubPool = {} as pg.Pool;
    const config = {
      enabled: true as const,
      apiKey: 'test-key',
      apiBaseUrl: 'https://api.revenuecat.com/v1',
      productTierMap: { celebbase_premium_monthly: 'premium' as const },
    };

    it('happy path: INITIAL_PURCHASE active entitlement → upsert + syncTier', async () => {
      const captured: CapturedLog[] = [];
      const log = makeCaptureLogger(captured);
      const adapter = { getSubscriber: jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(activeEntitlementSnapshot) };
      const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const userClient = { syncTier };

      await handleWebhookEvent({
        pool: stubPool,
        payload: {
          id: 'rc-evt-001',
          type: 'INITIAL_PURCHASE',
          app_user_id: validUserId,
          transaction_id: 'txn-abc',
        },
        config,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userClient: userClient as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter: adapter as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        log: log as any,
      });

      expect(adapter.getSubscriber).toHaveBeenCalledWith(validUserId);
      expect(mockUpsertRevenuecat).toHaveBeenCalledTimes(1);
      expect(syncTier).toHaveBeenCalledWith(validUserId, 'premium', expect.objectContaining({ idempotencyKey: expect.stringContaining('rc-evt-001') }));
    });

    it('missing app_user_id → throws', async () => {
      const log = makeCaptureLogger([]);
      const adapter = { getSubscriber: jest.fn() };
      const userClient = { syncTier: jest.fn() };
      await expect(
        handleWebhookEvent({
          pool: stubPool,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: { id: 'rc-evt-002', type: 'INITIAL_PURCHASE', app_user_id: '' } as any,
          config,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          userClient: userClient as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          adapter: adapter as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          log: log as any,
        }),
      ).rejects.toThrow('app_user_id is required');
    });

    it('no entitlement → syncTier(free) called, no upsert', async () => {
      const log = makeCaptureLogger([]);
      const adapter = { getSubscriber: jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(emptySnapshot) };
      const syncTier = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const userClient = { syncTier };

      await handleWebhookEvent({
        pool: stubPool,
        payload: { id: 'rc-evt-003', type: 'EXPIRATION', app_user_id: validUserId },
        config,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userClient: userClient as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        adapter: adapter as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        log: log as any,
      });

      expect(mockUpsertRevenuecat).not.toHaveBeenCalled();
      expect(syncTier).toHaveBeenCalledWith(validUserId, 'free', expect.objectContaining({ idempotencyKey: expect.stringContaining('rc-evt-003') }));
    });
  });

  it('non-409 user-service error → propagated as 500', async () => {
    const captured: CapturedLog[] = [];
    const getSubscriber = jest.fn<() => Promise<RevenuecatSubscriberSnapshot>>().mockResolvedValue(activeEntitlementSnapshot);
    const syncTier = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('InternalClientError: 503 /internal/users/.../tier'));
    const app = buildApp(captured, { getSubscriber, syncTier });
    await app.ready();

    const token = await makeInternalToken();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/subscriptions/refresh-from-revenuecat',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { user_id: validUserId, source: 'purchase' },
    });

    expect(res.statusCode).toBe(500);

    await app.close();
  });
});
