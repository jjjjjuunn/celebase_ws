// Per-route rate-limit integration tests (IMPL-010-e).
//
// Existing unit tests never instantiate Fastify so the global allowList
// (`NODE_ENV==='test'`) protects them from regression. These tests flip
// NODE_ENV for their duration so the actual limiter runs, then restore it.
//
// ESM mocking note: ts-jest ESM mode freezes module namespaces, so
// `jest.spyOn(authService, 'signup')` throws "Cannot assign to read only
// property". We use `jest.unstable_mockModule` (the pattern already used
// in tests/unit/auth.service.test.ts) instead.

import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';

const mockSignup = jest.fn();
const mockLogin = jest.fn();
const mockRefresh = jest.fn();
// Promotable mock — handler-inline JWT verify uses this. The "limiter still
// caps invalid tokens" test below reconfigures it to reject.
const mockVerifyInternalRefresh =
  jest.fn<
    () => Promise<{ sub: string; email: string; cognito_sub: string; jti: string }>
  >();

// IMPL-MOBILE-AUTH-002b: logout route now has rate-limiting + handler-inline
// JWT verify (verifyInternalRefresh derives both jti and userId=sub from the
// refresh_token). We mock refresh-token repo + verifyInternalRefresh so
// /auth/logout returns 204 idempotently inside the rate-limit test.
jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
  signup: mockSignup,
  login: mockLogin,
  performRotation: mockRefresh,
  DevAuthProvider: class {
    verifyIdToken(): Promise<{ sub: string; email: string }> {
      return Promise.resolve({ sub: 'stub', email: 'stub@example.com' });
    }
    issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
      return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
    }
  },
  loadDevSecret: (): Uint8Array => new TextEncoder().encode('test-secret-32-bytes-xxxxxxxxxxxx'),
  issueInternalTokens: (): Promise<{ access_token: string; refresh_token: string }> =>
    Promise.resolve({ access_token: 'a', refresh_token: 'r' }),
  verifyInternalRefresh: mockVerifyInternalRefresh,
}));

const mockRevokeForLogout = jest.fn<() => Promise<null | { rotatedToJti: string | null }>>();
const mockRevokeChainForLogout = jest.fn<() => Promise<number>>();
jest.unstable_mockModule('../../src/repositories/refresh-token.repository.js', () => ({
  insert: jest.fn(),
  revokeForRotation: jest.fn(),
  findMetadata: jest.fn(),
  revokeAllByUser: jest.fn(),
  revokeForLogout: mockRevokeForLogout,
  revokeChainForLogout: mockRevokeChainForLogout,
}));

const { authRoutes } = await import('../../src/routes/auth.routes.js');
const { DevAuthProvider } = await import('../../src/services/auth.service.js');

const originalNodeEnv = process.env['NODE_ENV'];
const mockPool = {} as pg.Pool;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  const provider = new DevAuthProvider();
  await app.register(authRoutes, { pool: mockPool, authProvider: provider });
  return app;
}

describe('per-route rate limits', () => {
  let app: FastifyInstance;

  beforeAll(() => {
    process.env['NODE_ENV'] = 'integration';
  });

  afterAll(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  beforeEach(async () => {
    mockSignup.mockResolvedValue({
      user: { id: 'u1' },
      access_token: 'a',
      refresh_token: 'r',
    } as never);
    mockLogin.mockResolvedValue({
      user: { id: 'u1' },
      access_token: 'a',
      refresh_token: 'r',
    } as never);
    mockRefresh.mockResolvedValue({ access_token: 'a', refresh_token: 'r' } as never);
    mockVerifyInternalRefresh.mockResolvedValue({
      sub: 'stub',
      email: 'stub@example.com',
      cognito_sub: 'stub',
      jti: 'stub-jti',
    });
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('/auth/signup returns 429 on the 4th request from the same IP', async () => {
    const payload = { email: 'a@b.co', display_name: 'T' };
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/signup', payload });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: '/auth/signup', payload });
    expect(limited.statusCode).toBe(429);
  });

  it('/auth/login returns 429 on the 11th request from the same IP (DECISION §3.2: 5→10/min)', async () => {
    const payload = { email: 'a@b.co' };
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: '/auth/login', payload });
    expect(limited.statusCode).toBe(429);
  });

  it('/auth/refresh returns 429 on the 31st request — DECISION §3.3: 20→30/min', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: 'token-A' },
      });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'token-A' },
    });
    expect(limited.statusCode).toBe(429);

    // Distinct token = distinct bucket — sha256(refresh_token) + IP key.
    const other = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'token-B' },
    });
    expect(other.statusCode).toBe(200);
  });

  it('/auth/logout returns 429 on the 21st request from the same IP — DECISION §3.4 newly added', async () => {
    // Happy path: verify resolves (mocked) → revokeForLogout returns null →
    // idempotent 204. Limiter caps at the 21st request.
    mockRevokeForLogout.mockResolvedValue(null);
    const payload = { refresh_token: 'stub-token' };
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/logout', payload });
      expect(res.statusCode).toBe(204);
    }
    const limited = await app.inject({ method: 'POST', url: '/auth/logout', payload });
    expect(limited.statusCode).toBe(429);
  });

  // Security regression: spec §9.3 requires the limiter to bucket invalid
  // tokens too, so a flood of junk refresh_token values cannot waste crypto
  // cycles indefinitely. Before the fix (/auth/logout NOT in publicPaths),
  // the root-scope external JWT onRequest hook ran first and 401'd every
  // request without incrementing the bucket. After the fix, the route is
  // public from the framework's POV, the per-route limiter runs first, and
  // verify (mocked here to reject) only gates the handler body.
  it('/auth/logout: limiter still caps even when verify rejects — invalid-token DoS protection', async () => {
    mockVerifyInternalRefresh.mockRejectedValue(new Error('jwt signature invalid'));
    const payload = { refresh_token: 'junk-token' };
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/logout', payload });
      // Each request should reach the handler, fail verify, and return 401.
      // The limiter bucket increments regardless.
      expect(res.statusCode).toBe(401);
    }
    const limited = await app.inject({ method: 'POST', url: '/auth/logout', payload });
    expect(limited.statusCode).toBe(429);
  });
});

describe('per-route rate limits with NODE_ENV=test allowList', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSignup.mockResolvedValue({
      user: { id: 'u1' },
      access_token: 'a',
      refresh_token: 'r',
    } as never);
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('does not 429 even after 10 signup attempts (bypass is active)', async () => {
    const payload = { email: 'a@b.co', display_name: 'T' };
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/signup', payload });
      expect(res.statusCode).toBe(200);
    }
  });
});

// IMPL-MOBILE-AUTH-002b: env override allows operations to retune the limits
// in staging/prod without redeploying. This describe block flips
// NODE_ENV !== 'test' and registers authRoutes with custom rateLimits.
describe('AUTH_RATE_LIMIT_* env override', () => {
  let app: FastifyInstance;
  const originalNodeEnvLocal = process.env['NODE_ENV'];

  beforeAll(() => {
    process.env['NODE_ENV'] = 'integration';
  });

  afterAll(() => {
    process.env['NODE_ENV'] = originalNodeEnvLocal;
  });

  beforeEach(async () => {
    mockSignup.mockResolvedValue({ user: { id: 'u1' }, access_token: 'a', refresh_token: 'r' } as never);
    mockLogin.mockResolvedValue({ user: { id: 'u1' }, access_token: 'a', refresh_token: 'r' } as never);
    app = Fastify({ logger: false });
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
    const provider = new DevAuthProvider();
    // Override login to 20/min — operations may want to relax under load.
    await app.register(authRoutes, {
      pool: mockPool,
      authProvider: provider,
      rateLimits: { login: 20 },
    });
    await app.ready();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('honors override for /auth/login (max=20) — 21st request is the first 429', async () => {
    const payload = { email: 'a@b.co' };
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: '/auth/login', payload });
    expect(limited.statusCode).toBe(429);
  });

  it('signup default (3/min) is preserved when override only sets login', async () => {
    // The override only changed `login`. signup falls through to the default.
    const payload = { email: 'a@b.co', display_name: 'T' };
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/signup', payload });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: '/auth/signup', payload });
    expect(limited.statusCode).toBe(429);
  });
});
