import { jest } from '@jest/globals';
import type pg from 'pg';
import type { UserServiceClient } from '../../src/services/user-service.client.js';
import { RevenuecatUnavailableError } from '../../src/adapters/revenuecat.adapter.js';

const REVENUECAT_AUTH_TOKEN = 'rc-test-token-abcdef123456';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandleWebhookEvent = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockMarkProcessed = jest.fn<any>();

jest.unstable_mockModule('../../src/services/revenuecat-sync.service.js', () => ({
  handleWebhookEvent: mockHandleWebhookEvent,
}));

jest.unstable_mockModule('../../src/repositories/processed-events.repository.js', () => ({
  markProcessed: mockMarkProcessed,
  findByEventId: jest.fn(),
}));

const { default: Fastify } = await import('fastify');
const { webhooksRoutes } = await import('../../src/routes/webhooks.routes.js');

interface CapturedLog {
  msg?: string;
  revenuecat_event_id?: string;
  event_type?: string;
  error?: string;
  upstream?: boolean;
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

function buildApp(captured: CapturedLog[]): ReturnType<typeof Fastify> {
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerInstance: makeCaptureLogger(captured) as any,
    disableRequestLogging: true,
  });
  const stubPool = { query: jest.fn() } as unknown as pg.Pool;
  const stubUserClient = {} as UserServiceClient;
  const stubAdapter = { getSubscriber: jest.fn() };
  void app.register((scope, _o, done) => {
    void webhooksRoutes(scope, {
      pool: stubPool,
      userClient: stubUserClient,
      commerceWebhookEnabled: true,
      revenuecatConfig: {
        enabled: true,
        authToken: REVENUECAT_AUTH_TOKEN,
        apiKey: 'test-key',
        apiBaseUrl: 'https://api.revenuecat.com/v1',
        productTierMap: { 'celebbase_premium_monthly': 'premium' },
      },
      revenuecatAdapter: stubAdapter,
    }).then(done);
  });
  return app;
}

const validEvent = {
  event: {
    id: 'rc-evt-sync-001',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user-abc-123',
  },
};

describe('POST /webhooks/revenuecat — sync service integration', () => {
  beforeEach(() => {
    mockHandleWebhookEvent.mockReset();
    mockMarkProcessed.mockReset();
  });

  it('happy path: handleWebhookEvent called and emits revenuecat.webhook.processed', async () => {
    mockMarkProcessed.mockResolvedValueOnce({ inserted: true });
    mockHandleWebhookEvent.mockResolvedValueOnce(undefined);
    const captured: CapturedLog[] = [];
    const app = buildApp(captured);
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
    expect(mockHandleWebhookEvent).toHaveBeenCalledTimes(1);
    expect(captured.some((l) => l.msg === 'revenuecat.webhook.processed')).toBe(true);
    await app.close();
  });

  it('handleWebhookEvent throws generic Error → 500 + upstream:false', async () => {
    mockMarkProcessed.mockResolvedValueOnce({ inserted: true });
    mockHandleWebhookEvent.mockRejectedValueOnce(new Error('downstream failure'));
    const captured: CapturedLog[] = [];
    const app = buildApp(captured);
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
    const failed = captured.find((l) => l.msg === 'revenuecat.webhook.processing_failed');
    expect(failed).toBeDefined();
    expect(failed?.upstream).toBe(false);
    await app.close();
  });

  it('handleWebhookEvent throws RevenuecatUnavailableError → 500 + upstream:true', async () => {
    mockMarkProcessed.mockResolvedValueOnce({ inserted: true });
    mockHandleWebhookEvent.mockRejectedValueOnce(
      new RevenuecatUnavailableError('RevenueCat down'),
    );
    const captured: CapturedLog[] = [];
    const app = buildApp(captured);
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
    const failed = captured.find((l) => l.msg === 'revenuecat.webhook.processing_failed');
    expect(failed).toBeDefined();
    expect(failed?.upstream).toBe(true);
    await app.close();
  });

  it('idempotency: markProcessed inserted:false → handleWebhookEvent NOT called, 200 + replay_skipped', async () => {
    mockMarkProcessed.mockResolvedValueOnce({ inserted: false });
    const captured: CapturedLog[] = [];
    const app = buildApp(captured);
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
    expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
    expect(captured.some((l) => l.msg === 'revenuecat.webhook.replay_skipped')).toBe(true);
    await app.close();
  });
});
