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

jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
  signup: mockSignup,
  login: mockLogin,
  refresh: mockRefresh,
  DevAuthProvider: class {
    verifyIdToken(): Promise<{ sub: string; email: string }> {
      return Promise.resolve({ sub: 'stub', email: 'stub@example.com' });
    }
    issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
      return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
    }
    refreshTokens(): Promise<{ access_token: string; refresh_token: string }> {
      return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
    }
  },
  loadDevSecret: (): Uint8Array => new TextEncoder().encode('test-secret-32-bytes-xxxxxxxxxxxx'),
  issueInternalTokens: (): Promise<{ access_token: string; refresh_token: string }> =>
    Promise.resolve({ access_token: 'a', refresh_token: 'r' }),
  verifyInternalRefresh: (): Promise<{ sub: string; email: string }> =>
    Promise.resolve({ sub: 'stub', email: 'stub@example.com' }),
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

  it('/auth/login returns 429 on the 6th request from the same IP', async () => {
    const payload = { email: 'a@b.co' };
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: '/auth/login', payload });
    expect(limited.statusCode).toBe(429);
  });

  it('/auth/refresh buckets by sha256(refresh_token) so distinct tokens are independent', async () => {
    for (let i = 0; i < 20; i++) {
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

    const other = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: 'token-B' },
    });
    expect(other.statusCode).toBe(200);
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
