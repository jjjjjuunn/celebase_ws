import { jest } from '@jest/globals';
import type pg from 'pg';
import type { UserServiceClient } from '../../src/services/user-service.client.js';

const REVENUECAT_AUTH_TOKEN = 'rc-test-token-abcdef123456';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockMarkProcessed = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandleWebhookEvent = jest.fn<any>();

jest.unstable_mockModule('../../src/repositories/processed-events.repository.js', () => ({
  markProcessed: mockMarkProcessed,
  findByEventId: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/revenuecat-sync.service.js', () => ({
  handleWebhookEvent: mockHandleWebhookEvent,
}));

const { default: Fastify } = await import('fastify');
const { webhooksRoutes } = await import('../../src/routes/webhooks.routes.js');

interface CapturedLog {
  msg?: string;
  revenuecat_event_id?: string;
  event_type?: string;
  error?: string;
}

function makeCaptureLogger(captured: CapturedLog[]): unknown {
  const logger = {
    level: 'info',
    silent: () => undefined,
    info: (obj: unknown, _msg?: string): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    warn: (obj: unknown, _msg?: string): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    error: (obj: unknown, _msg?: string): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    debug: () => undefined,
    trace: () => undefined,
    fatal: () => undefined,
    child: (): unknown => logger,
  };
  return logger;
}

function buildApp(opts: {
  captured: CapturedLog[];
  commerceWebhookEnabled: boolean;
  revenuecatEnabled: boolean;
}): ReturnType<typeof Fastify> {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerInstance: makeCaptureLogger(opts.captured) as any,
    disableRequestLogging: true,
  });
  const stubPool = { query: jest.fn() } as unknown as pg.Pool;
  const stubUserClient = {} as UserServiceClient;
  const stubAdapter = { getSubscriber: jest.fn() };
  void app.register((scope, _o, done) => {
    void webhooksRoutes(scope, {
      pool: stubPool,
      userClient: stubUserClient,
      commerceWebhookEnabled: opts.commerceWebhookEnabled,
      ...(opts.revenuecatEnabled
        ? {
            revenuecatConfig: {
              enabled: true,
              authToken: REVENUECAT_AUTH_TOKEN,
              apiKey: 'test-key',
              apiBaseUrl: 'https://api.revenuecat.com/v1',
              productTierMap: { 'celebbase_premium_monthly': 'premium' },
            },
            revenuecatAdapter: stubAdapter,
          }
        : {}),
    }).then(done);
  });
  return app;
}

const validEvent = { event: { id: 'rc-evt-123', type: 'INITIAL_PURCHASE', app_user_id: 'user-abc-123' } };

describe('POST /webhooks/revenuecat — auth & validation', () => {
  beforeEach(() => {
    mockMarkProcessed.mockReset();
    mockHandleWebhookEvent.mockReset();
  });

  it('returns 503 when commerceWebhookEnabled=false', async () => {
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: false, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: { authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`, 'content-type': 'application/json' },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 503 when revenuecatConfig is undefined', async () => {
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: false });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: { authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`, 'content-type': 'application/json' },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(503);
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: { 'content-type': 'application/json' },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('UNAUTHORIZED');
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 401 when Authorization header is malformed (no Bearer prefix)', async () => {
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: { authorization: REVENUECAT_AUTH_TOKEN, 'content-type': 'application/json' },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.message).toMatch(/Missing or malformed/);
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 401 when Bearer token does not match', async () => {
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: { authorization: 'Bearer wrong-token-zzzzzzzzzzzzzz', 'content-type': 'application/json' },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.message).toMatch(/Invalid webhook auth token/);
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 on invalid JSON body', async () => {
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: {
        authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: '{ this is not valid json',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(JSON.parse(res.body).error.message).toMatch(/Invalid JSON body/);
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 400 on Zod validation failure (missing event.id)', async () => {
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: {
        authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { event: { type: 'INITIAL_PURCHASE' } },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/Invalid RevenueCat event shape/);
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /webhooks/revenuecat — dedup & happy path', () => {
  beforeEach(() => {
    mockMarkProcessed.mockReset();
    mockHandleWebhookEvent.mockReset();
  });

  it('returns 200 + emits revenuecat.webhook.processed on first occurrence', async () => {
    mockMarkProcessed.mockResolvedValueOnce({ inserted: true });
    mockHandleWebhookEvent.mockResolvedValueOnce(undefined);
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: {
        authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true });
    expect(mockMarkProcessed).toHaveBeenCalledTimes(1);
    const call = mockMarkProcessed.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(call).toMatchObject({
      provider: 'revenuecat',
      eventId: 'rc-evt-123',
      stripeEventId: 'rc-evt-123',
      eventType: 'INITIAL_PURCHASE',
      result: 'applied',
    });
    expect(captured.some((l) => l.msg === 'revenuecat.webhook.processed')).toBe(true);
    expect(captured.some((l) => l.msg === 'revenuecat.webhook.replay_skipped')).toBe(false);
    await app.close();
  });

  it('returns 200 + emits revenuecat.webhook.replay_skipped on duplicate', async () => {
    mockMarkProcessed.mockResolvedValueOnce({ inserted: false });
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: {
        authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true });
    expect(captured.some((l) => l.msg === 'revenuecat.webhook.replay_skipped')).toBe(true);
    expect(captured.some((l) => l.msg === 'revenuecat.webhook.received')).toBe(false);
    await app.close();
  });

  it('returns 500 + emits revenuecat.webhook.dedup_failed when markProcessed throws', async () => {
    mockMarkProcessed.mockRejectedValueOnce(new Error('db connection lost'));
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: {
        authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: validEvent,
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error.code).toBe('WEBHOOK_PROCESSING_FAILED');
    const dedupFailed = captured.find((l) => l.msg === 'revenuecat.webhook.dedup_failed');
    expect(dedupFailed).toBeDefined();
    expect(dedupFailed?.error).toMatch(/db connection lost/);
    expect(captured.some((l) => l.msg === 'revenuecat.webhook.received')).toBe(false);
    await app.close();
  });
});

describe('POST /webhooks/revenuecat — Authorization header does NOT log token', () => {
  beforeEach(() => {
    mockMarkProcessed.mockReset();
    mockHandleWebhookEvent.mockReset();
  });

  it('does not include Bearer token text in any captured log', async () => {
    mockMarkProcessed.mockResolvedValueOnce({ inserted: true });
    mockHandleWebhookEvent.mockResolvedValueOnce(undefined);
    const captured: CapturedLog[] = [];
    const app = buildApp({ captured, commerceWebhookEnabled: true, revenuecatEnabled: true });
    await app.ready();
    await app.inject({
      method: 'POST',
      url: '/webhooks/revenuecat',
      headers: {
        authorization: `Bearer ${REVENUECAT_AUTH_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: validEvent,
    });
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(REVENUECAT_AUTH_TOKEN);
    await app.close();
  });
});
