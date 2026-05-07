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
//
// IMPL-MOBILE-AUTH-003: performRotation now reads the users row inside the tx
// to gate ACCOUNT_DELETED. The default implementation here returns a live user
// (deleted_at = null) for any `SELECT * FROM users` query so existing tests
// keep their happy-path semantics. Tests that exercise ACCOUNT_DELETED or
// "user row missing" override mockClientQuery with a per-case impl.
const liveUserRow = {
  id: 'user-default',
  email: 'test@example.com',
  cognito_sub: 'dev-sub',
  display_name: 'Test User',
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

function makeQueryResult(rows: unknown[] = []): pg.QueryResult {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  } as pg.QueryResult;
}

function defaultClientQueryImpl(sql: unknown): Promise<pg.QueryResult> {
  if (typeof sql === 'string' && sql.startsWith('SELECT * FROM users')) {
    return Promise.resolve(makeQueryResult([liveUserRow]));
  }
  return Promise.resolve(makeQueryResult([]));
}

const mockClientQuery = jest.fn<(sql: unknown) => Promise<pg.QueryResult>>(
  defaultClientQueryImpl,
);
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

  // Mirror packages/service-core/src/app.ts:44 — production wraps AppError into
  // `{error: {code, message, details, requestId}}`. Replicating it here keeps
  // envelope assertions consistent with what mobile clients see in prod.
  const { AppError } = await import('@celebbase/service-core');
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: request.id,
        },
      });
      return;
    }
    void reply.send(error);
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
    mockClientQuery.mockImplementation(defaultClientQueryImpl);
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

// IMPL-MOBILE-AUTH-003 (Plan v5 §59) — `/auth/refresh` 응답 envelope `error.code`
// 가 5종 enum 으로 분기되는지 검증. mobile state machine 의 source of truth.
describe('POST /auth/refresh — IMPL-MOBILE-AUTH-003 envelope reason codes', () => {
  let captured: CapturedLog[];
  let app: FastifyInstance;

  beforeEach(() => {
    captured = [];
    jest.resetAllMocks();
    mockInsert.mockResolvedValue(undefined);
    mockRevokeAllByUser.mockResolvedValue(0);
    mockClientQuery.mockImplementation(defaultClientQueryImpl);
    mockConnectFn.mockResolvedValue(mockClient);
  });

  afterEach(async () => {
    await app.close();
  });

  function readEnvelope(body: string): {
    code: string;
    message: string;
    requestId: string;
  } {
    const parsed = JSON.parse(body) as {
      error: { code: string; message: string; requestId: string };
    };
    return parsed.error;
  }

  it('MALFORMED — JWT signature 위조 시 envelope code=MALFORMED', async () => {
    const wrongSecret = new TextEncoder().encode(
      'wrong-secret-32-chars-padding!!!',
    );
    const forged = await new SignJWT({
      sub: 'user-forged',
      email: 't@e.com',
      cognito_sub: 'dev-sub',
      token_use: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .setIssuer('celebbase-internal')
      .setJti('jti-forged')
      .sign(wrongSecret);

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: forged },
    });

    expect(res.statusCode).toBe(401);
    expect(readEnvelope(res.body).code).toBe('MALFORMED');
  });

  it('MALFORMED — token_use !== "refresh" → envelope code=MALFORMED', async () => {
    const accessToken = await new SignJWT({
      sub: 'user-x',
      email: 't@e.com',
      cognito_sub: 'dev-sub',
      token_use: 'access', // ← refresh 가 아님
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .setIssuer('celebbase-internal')
      .setJti('jti-access')
      .sign(TEST_SECRET);

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: accessToken },
    });

    expect(res.statusCode).toBe(401);
    expect(readEnvelope(res.body).code).toBe('MALFORMED');
  });

  it('REFRESH_EXPIRED_OR_MISSING — jose JWTExpired → envelope code=REFRESH_EXPIRED_OR_MISSING', async () => {
    // 60초 전에 만료된 토큰
    const expiredToken = await new SignJWT({
      sub: 'user-expired-jwt',
      email: 't@e.com',
      cognito_sub: 'dev-sub',
      token_use: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setIssuer('celebbase-internal')
      .setJti('jti-expired-jwt')
      .sign(TEST_SECRET);

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: expiredToken },
    });

    expect(res.statusCode).toBe(401);
    expect(readEnvelope(res.body).code).toBe('REFRESH_EXPIRED_OR_MISSING');
  });

  it('REFRESH_EXPIRED_OR_MISSING — DB meta 부재 → envelope code=REFRESH_EXPIRED_OR_MISSING', async () => {
    const { token: rt } = await makeRefreshToken('user-meta-missing');
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
    expect(readEnvelope(res.body).code).toBe('REFRESH_EXPIRED_OR_MISSING');
    expect(mockRevokeAllByUser).not.toHaveBeenCalled();
  });

  it('TOKEN_REUSE_DETECTED — revokedReason=rotated → envelope code=TOKEN_REUSE_DETECTED + revokeAllByUser 호출', async () => {
    const { token: rt } = await makeRefreshToken('user-reuse-envelope');
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
    expect(readEnvelope(res.body).code).toBe('TOKEN_REUSE_DETECTED');
    expect(mockRevokeAllByUser).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ reason: 'reuse_detected' }),
    );
  });

  it('REFRESH_REVOKED — revokedReason=logout → envelope code=REFRESH_REVOKED', async () => {
    const { token: rt } = await makeRefreshToken('user-logout-envelope');
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
    expect(readEnvelope(res.body).code).toBe('REFRESH_REVOKED');
    expect(mockRevokeAllByUser).not.toHaveBeenCalled();
  });

  it('ACCOUNT_DELETED — users.deleted_at IS NOT NULL → envelope code=ACCOUNT_DELETED', async () => {
    const { token: rt } = await makeRefreshToken('user-deleted');
    mockClientQuery.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.startsWith('SELECT * FROM users')) {
        return Promise.resolve(
          makeQueryResult([{ ...liveUserRow, deleted_at: new Date() }]),
        );
      }
      return Promise.resolve(makeQueryResult([]));
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
    expect(readEnvelope(res.body).code).toBe('ACCOUNT_DELETED');
    // ROLLBACK 이후 issueInternalTokens 가 호출되지 않으므로 refreshTokenRepo.insert 도 미호출
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRevokeForRotation).not.toHaveBeenCalled();
  });

  it('MALFORMED — user row 부재 시 envelope code=MALFORMED (token sub 가 DB 에 없음)', async () => {
    const { token: rt } = await makeRefreshToken('user-ghost');
    mockClientQuery.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.startsWith('SELECT * FROM users')) {
        return Promise.resolve(makeQueryResult([])); // ← user row 없음
      }
      return Promise.resolve(makeQueryResult([]));
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
    expect(readEnvelope(res.body).code).toBe('MALFORMED');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('envelope 의 requestId 가 모든 케이스에서 string', async () => {
    const wrongSecret = new TextEncoder().encode(
      'another-wrong-secret-32-chars!!!',
    );
    const forged = await new SignJWT({
      sub: 'user-req-id',
      email: 't@e.com',
      cognito_sub: 'dev-sub',
      token_use: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .setIssuer('celebbase-internal')
      .setJti('jti-rid')
      .sign(wrongSecret);

    app = await buildApp(captured);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: { refresh_token: forged },
    });

    expect(res.statusCode).toBe(401);
    const env = readEnvelope(res.body);
    expect(env.code).toBe('MALFORMED');
    expect(typeof env.requestId).toBe('string');
    expect(env.requestId.length).toBeGreaterThan(0);
  });
});
