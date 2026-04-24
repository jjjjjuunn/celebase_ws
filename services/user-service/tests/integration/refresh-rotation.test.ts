// /auth/refresh integration tests — Phase C jti rotation (IMPL-010-f).
//
// Tests rotation happy-path, parallel race safety, reuse detection, expiry,
// logout→refresh, 15m access-token TTL, and invalid body validation.
//
// Only `refresh-token.repository` is mocked; auth.service and auth.routes
// run real code so that the full rotation transaction is exercised.

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';
import { SignJWT, decodeJwt } from 'jose';

// Repository mock — must be declared before route/service dynamic imports
const mockInsert = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRevokeForRotation = jest.fn<() => Promise<boolean>>();
const mockFindMetadata = jest.fn();
const mockRevokeAllByUser = jest.fn<() => Promise<number>>().mockResolvedValue(0);
const mockRevokeForLogout = jest.fn();
const mockRevokeChainForLogout = jest.fn();

jest.unstable_mockModule('../../src/repositories/refresh-token.repository.js', () => ({
  insert: mockInsert,
  revokeForRotation: mockRevokeForRotation,
  findMetadata: mockFindMetadata,
  revokeAllByUser: mockRevokeAllByUser,
  revokeForLogout: mockRevokeForLogout,
  revokeChainForLogout: mockRevokeChainForLogout,
}));

const { authRoutes } = await import('../../src/routes/auth.routes.js');
const { DevAuthProvider } = await import('../../src/services/auth.service.js');

const TEST_SECRET = new TextEncoder().encode(
  process.env['INTERNAL_JWT_SECRET'] ?? 'dev-internal-secret-32-chars-pad',
);

async function makeRefreshToken(
  sub: string,
  jtiValue = `jti-${sub}`,
): Promise<{ token: string; jti: string }> {
  const token = await new SignJWT({
    sub,
    email: 'test@example.com',
    cognito_sub: 'dev-sub',
    token_use: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .setIssuer('celebbase-internal')
    .setJti(jtiValue)
    .sign(TEST_SECRET);
  return { token, jti: jtiValue };
}

// Pool mock: performRotation uses pool.connect() for the rotation transaction.
// Mocked PoolClient handles BEGIN/COMMIT/ROLLBACK transparently.
const mockClientQuery = jest.fn<() => Promise<pg.QueryResult>>().mockResolvedValue({
  rows: [],
  rowCount: 0,
  command: '',
  oid: 0,
  fields: [],
} as pg.QueryResult);
const mockRelease = jest.fn<(err?: Error | undefined) => void>();
const mockClient = {
  query: mockClientQuery,
  release: mockRelease,
} as unknown as pg.PoolClient;
const mockConnectFn = jest.fn<() => Promise<pg.PoolClient>>().mockResolvedValue(mockClient);
const mockPool = { connect: mockConnectFn } as unknown as pg.Pool;

interface CapturedLog {
  event?: string;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCaptureLogger(captured: CapturedLog[]): any {
  const logger = {
    level: 'info',
    silent: () => undefined,
    info: (obj: unknown, _msg?: string): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    warn: (obj: unknown, _msg?: string): void => {
      if (typeof obj === 'object' && obj !== null) captured.push(obj as CapturedLog);
    },
    error: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    fatal: () => undefined,
    child: () => logger,
  };
  return logger;
}

async function buildApp(captured: CapturedLog[]): Promise<FastifyInstance> {
  const loggerInstance = makeCaptureLogger(captured);
  const app = Fastify({ loggerInstance, disableRequestLogging: true });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: (_req, _key) => process.env['NODE_ENV'] === 'test',
  });

  const provider = new DevAuthProvider();
  await app.register(authRoutes, { pool: mockPool, authProvider: provider });
  return app;
}

describe('POST /auth/refresh — Phase C rotation', () => {
  let captured: CapturedLog[];
  let app: FastifyInstance;

  beforeEach(() => {
    captured = [];
    jest.resetAllMocks();
    mockInsert.mockResolvedValue(undefined);
    mockRevokeAllByUser.mockResolvedValue(0);
    mockClientQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    } as pg.QueryResult);
    mockConnectFn.mockResolvedValue(mockClient);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rotation 성공 — 200, 새 access/refresh pair 반환, auth.refresh.rotated 로그 emit', async () => {
    const { token: rt } = await makeRefreshToken('user-abc');
    mockRevokeForRotation.mockResolvedValue(true);

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { access_token: string; refresh_token: string };
    expect(typeof body.access_token).toBe('string');
    expect(typeof body.refresh_token).toBe('string');

    const rotatedLog = captured.find((l) => l.event === 'auth.refresh.rotated');
    expect(rotatedLog).toBeDefined();
    expect(typeof rotatedLog?.user_id_hash).toBe('string');
    expect(typeof rotatedLog?.old_jti_hash).toBe('string');
    expect(typeof rotatedLog?.new_jti_hash).toBe('string');
  });

  it('parallel refresh race — 동일 token 두 번 요청, 두 번째는 401', async () => {
    const { token: rt } = await makeRefreshToken('user-race');
    mockRevokeForRotation
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockFindMetadata.mockResolvedValue({
      revokedReason: 'rotated',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    app = await buildApp(captured);
    await app.ready();

    const headers = { 'content-type': 'application/json' };
    const payload = { refresh_token: rt };

    const [res1, res2] = await Promise.all([
      app.inject({ method: 'POST', url: '/auth/refresh', headers, payload }),
      app.inject({ method: 'POST', url: '/auth/refresh', headers, payload }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    expect(statuses).toEqual([200, 401]);
  });

  it('reuse_detected — revokeAllByUser 호출 + auth.token.reuse_detected 로그 + 401', async () => {
    const { token: rt } = await makeRefreshToken('user-reuse');
    mockRevokeForRotation.mockResolvedValue(false);
    mockFindMetadata.mockResolvedValue({
      revokedReason: 'rotated',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(401);
    expect(mockRevokeAllByUser).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ reason: 'reuse_detected' }),
    );

    const reuseLog = captured.find((l) => l.event === 'auth.token.reuse_detected');
    expect(reuseLog).toBeDefined();
    expect(reuseLog?.original_revoked_reason).toBe('rotated');
  });

  it('expired token — findMetadata null → 401 + auth.refresh.expired_or_missing 로그', async () => {
    const { token: rt } = await makeRefreshToken('user-expired');
    mockRevokeForRotation.mockResolvedValue(false);
    mockFindMetadata.mockResolvedValue(null);

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(401);
    const expiredLog = captured.find((l) => l.event === 'auth.refresh.expired_or_missing');
    expect(expiredLog).toBeDefined();
    expect(mockRevokeAllByUser).not.toHaveBeenCalled();
  });

  it('logout→refresh — revokedReason=logout → 401, revokeAllByUser 미호출', async () => {
    const { token: rt } = await makeRefreshToken('user-loggedout');
    mockRevokeForRotation.mockResolvedValue(false);
    mockFindMetadata.mockResolvedValue({
      revokedReason: 'logout',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(401);
    expect(mockRevokeAllByUser).not.toHaveBeenCalled();
  });

  it('access token TTL = 15m — exp - iat ≤ 15 * 60 + 5', async () => {
    const { token: rt } = await makeRefreshToken('user-ttl');
    mockRevokeForRotation.mockResolvedValue(true);

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { access_token: string };
    const decoded = decodeJwt(body.access_token);
    const ttl = (decoded.exp ?? 0) - (decoded.iat ?? 0);
    expect(ttl).toBeLessThanOrEqual(15 * 60 + 5);
    expect(ttl).toBeGreaterThan(0);
  });

  it('invalid body — refresh_token 없음 → 400', async () => {
    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
