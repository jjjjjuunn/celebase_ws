// /auth/logout integration tests — Phase C stateful token revocation (IMPL-010-f).
//
// Tests stateful revocation via refresh_tokens table:
//   - 204 + auth.logout log on success
//   - 401 when no userId from JWT middleware
//   - 400 when refresh_token body is missing (now REQUIRED)
//   - 400 when refresh_token has wrong type
//   - 204 idempotent on double logout (already-revoked token)
//   - chain walk: logout on A revokes forward chain A→B→C
//
// Logger capture: Fastify creates a child logger per request, so a post-hoc
// monkey-patch on `app.log.info` does NOT propagate. We pass a minimal
// synchronous logger whose `child()` returns the same instance.

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';
import { SignJWT } from 'jose';

// Repository mock — set up before route import so ESM mock applies
const mockRevokeForLogout = jest.fn<() => Promise<{ rotatedToJti: string | null } | null>>();
const mockRevokeChainForLogout = jest.fn<() => Promise<number>>();

jest.unstable_mockModule('../../src/repositories/refresh-token.repository.js', () => ({
  insert: jest.fn(),
  revokeForRotation: jest.fn(),
  findMetadata: jest.fn(),
  revokeForLogout: mockRevokeForLogout,
  revokeChainForLogout: mockRevokeChainForLogout,
  revokeAllByUser: jest.fn(),
}));

const { authRoutes } = await import('../../src/routes/auth.routes.js');
const { DevAuthProvider } = await import('../../src/services/auth.service.js');

const TEST_SECRET = new TextEncoder().encode(process.env['INTERNAL_JWT_SECRET'] ?? 'dev-internal-secret-32-chars-pad');

async function makeRefreshToken(sub: string): Promise<string> {
  return new SignJWT({ sub, email: 'test@example.com', cognito_sub: 'dev-sub', token_use: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .setIssuer('celebbase-internal')
    .sign(TEST_SECRET);
}

const mockPool = {} as pg.Pool;

interface CapturedLog {
  event?: string;
  requestId?: unknown;
  user_id_hash?: unknown;
  chain_len?: unknown;
  [key: string]: unknown;
}

interface BuildOptions {
  injectUserId?: string;
  requireAuth?: boolean;
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

async function buildApp(captured: CapturedLog[], opts: BuildOptions = {}): Promise<FastifyInstance> {
  const loggerInstance = makeCaptureLogger(captured);
  const app = Fastify({ loggerInstance, disableRequestLogging: true });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: (_req, _key) => process.env['NODE_ENV'] === 'test',
  });

  app.addHook('onRequest', (request: FastifyRequest, reply, done) => {
    if (opts.injectUserId !== undefined) {
      (request as FastifyRequest & { userId: string }).userId = opts.injectUserId;
      done();
      return;
    }
    if (opts.requireAuth === true) {
      void reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing session', requestId: request.id },
      });
      return;
    }
    done();
  });

  const provider = new DevAuthProvider();
  await app.register(authRoutes, { pool: mockPool, authProvider: provider });
  return app;
}

describe('POST /auth/logout — Phase C stateful revocation', () => {
  let captured: CapturedLog[];
  let app: FastifyInstance;

  beforeEach(() => {
    captured = [];
    jest.resetAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 204 and emits auth.logout when refresh_token is valid and active', async () => {
    const rt = await makeRefreshToken('user-uuid-42');
    mockRevokeForLogout.mockResolvedValue({ rotatedToJti: null });

    app = await buildApp(captured, { injectUserId: 'user-uuid-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    const logoutLog = captured.find((l) => l.event === 'auth.logout');
    expect(logoutLog).toBeDefined();
    expect(typeof logoutLog?.user_id_hash).toBe('string');
    expect((logoutLog?.user_id_hash as string).length).toBe(8);
    expect(JSON.stringify(logoutLog)).not.toContain('user-uuid-42');
    expect(JSON.stringify(logoutLog)).not.toContain(rt);
  });

  it('returns 204 idempotently when token is already revoked', async () => {
    const rt = await makeRefreshToken('user-42');
    mockRevokeForLogout.mockResolvedValue(null); // rowCount=0 → already revoked

    app = await buildApp(captured, { injectUserId: 'user-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(204);
    expect(mockRevokeChainForLogout).not.toHaveBeenCalled();
  });

  it('walks forward rotation chain when rotatedToJti is present', async () => {
    const rt = await makeRefreshToken('user-chain');
    mockRevokeForLogout.mockResolvedValue({ rotatedToJti: 'jti-B' });
    mockRevokeChainForLogout.mockResolvedValue(2);

    app = await buildApp(captured, { injectUserId: 'user-chain' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(res.statusCode).toBe(204);
    expect(mockRevokeChainForLogout).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ startJti: 'jti-B' }),
    );
    const logoutLog = captured.find((l) => l.event === 'auth.logout');
    expect(typeof logoutLog?.chain_len).toBe('number');
  });

  it('returns 401 when the auth middleware rejects an unauthenticated request', async () => {
    app = await buildApp(captured, { requireAuth: true });
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(res.statusCode).toBe(401);
    expect(captured.find((l) => l.event === 'auth.logout')).toBeUndefined();
  });

  it('returns 400 when refresh_token body is missing (now REQUIRED)', async () => {
    app = await buildApp(captured, { injectUserId: 'user-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when refresh_token is empty string', async () => {
    app = await buildApp(captured, { injectUserId: 'user-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when refresh_token has wrong type (number)', async () => {
    app = await buildApp(captured, { injectUserId: 'user-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: 42 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when refresh_token JWT signature is invalid (timing-safe: no DB call)', async () => {
    app = await buildApp(captured, { injectUserId: 'user-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: 'not.a.valid.jwt' },
    });

    expect(res.statusCode).toBe(401);
    expect(mockRevokeForLogout).not.toHaveBeenCalled();
  });

  it('Rule #8: raw refresh token must never appear in captured logs', async () => {
    const rt = await makeRefreshToken('user-42');
    mockRevokeForLogout.mockResolvedValue({ rotatedToJti: null });

    app = await buildApp(captured, { injectUserId: 'user-42' });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: rt },
    });

    expect(JSON.stringify(captured)).not.toContain(rt);
  });
});
