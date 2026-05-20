/**
 * Tests for JWT middleware (registerJwtAuth).
 *
 * Since jose is an ESM-only package and jest.mock doesn't work well with ESM,
 * we test the middleware behavior by exercising the public API through Fastify hooks.
 * jose is NOT mocked — we test stub mode (no JWKS) and real mode behavior.
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  calculateJwkThumbprint,
  type JWK,
  type CryptoKey,
} from 'jose';

type HookFn = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

// Dynamic import to work with ESM
let registerJwtAuth: (
  app: FastifyInstance,
  opts?: { publicPaths?: readonly string[]; mode?: 'internal' | 'jwks' | 'stub' },
) => void;
let resetInternalJwksForTest: () => void;

beforeAll(async () => {
  const mod = await import('../../src/middleware/jwt.js');
  registerJwtAuth = mod.registerJwtAuth;
  resetInternalJwksForTest = mod.resetInternalJwksForTest;
});

function createMockApp(): FastifyInstance & { _hooks: HookFn[] } {
  const hooks: HookFn[] = [];
  return {
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      fatal: jest.fn(),
      error: jest.fn(),
    },
    addHook: jest.fn((_name: string, fn: HookFn) => {
      hooks.push(fn);
    }),
    _hooks: hooks,
  } as unknown as FastifyInstance & { _hooks: HookFn[] };
}

function createMockRequest(overrides: Record<string, unknown> = {}): FastifyRequest {
  return {
    url: '/users/me',
    headers: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

function getFirstHook(app: { _hooks: HookFn[] }): HookFn {
  const hook = app._hooks[0];
  if (!hook) throw new Error('No hooks registered');
  return hook;
}

const mockReply = {} as FastifyReply;

describe('registerJwtAuth — stub mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['JWKS_URI'];
    delete process.env['JWT_ISSUER'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to stub mode in development when JWKS_URI is not set', () => {
    process.env['NODE_ENV'] = 'development';

    const app = createMockApp();
    registerJwtAuth(app);

    expect(app.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('STUB mode'),
    );
    expect(app.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
  });

  it('stub mode sets userId to dev-user-stub', async () => {
    process.env['NODE_ENV'] = 'test';

    const app = createMockApp();
    registerJwtAuth(app);

    const request = createMockRequest();
    await getFirstHook(app)(request, mockReply);

    expect((request as FastifyRequest & { userId: string }).userId).toBe('dev-user-stub');
  });

  it('exits process in production when JWKS_URI is not set', () => {
    process.env['NODE_ENV'] = 'production';

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const app = createMockApp();

    registerJwtAuth(app);

    expect(app.log.fatal).toHaveBeenCalledWith(
      expect.stringContaining('production'),
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});

describe('registerJwtAuth — JWKS mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['JWKS_URI'] = 'https://cognito.example.com/.well-known/jwks.json';
    process.env['JWT_ISSUER'] = 'https://cognito.example.com';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('registers onRequest hook when JWKS_URI is configured', () => {
    const app = createMockApp();
    registerJwtAuth(app);

    expect(app.log.info).toHaveBeenCalledWith(
      expect.stringContaining('JWKS'),
      expect.any(String),
    );
    expect(app.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
  });

  it('skips verification for /health', async () => {
    const app = createMockApp();
    registerJwtAuth(app);

    const request = createMockRequest({ url: '/health' });
    // Should not throw — public path
    await getFirstHook(app)(request, mockReply);
  });

  it('throws UnauthorizedError when no Authorization header', async () => {
    const app = createMockApp();
    registerJwtAuth(app);

    const request = createMockRequest({ headers: {} });

    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(
      'Missing or malformed Authorization header',
    );
  });

  it('throws UnauthorizedError for non-Bearer token', async () => {
    const app = createMockApp();
    registerJwtAuth(app);

    const request = createMockRequest({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(
      'Missing or malformed Authorization header',
    );
  });

  it('throws when Bearer token fails JWKS verification', async () => {
    const app = createMockApp();
    registerJwtAuth(app);

    const request = createMockRequest({
      headers: { authorization: 'Bearer not.a.real.token' },
    });

    // jose will throw because the token is invalid
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow();
  });

  // Regression: content-service catalog (GET /celebrities*) is public per
  // spec §S2. Before the publicPaths patch, JWKS mode forced 401 on these
  // (BFF calls them token-less via createPublicRoute) — staging-only because
  // tests run in stub mode. These assertions lock the wildcard contract.
  it('skips verification for exact public path /celebrities', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { publicPaths: ['/celebrities', '/celebrities/*'] });

    const request = createMockRequest({ url: '/celebrities', headers: {} });
    // No Authorization header — must NOT throw because path is public.
    await getFirstHook(app)(request, mockReply);
  });

  it('skips verification for wildcard public path /celebrities/:slug', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { publicPaths: ['/celebrities', '/celebrities/*'] });

    for (const url of [
      '/celebrities/ariana-grande',
      '/celebrities/ariana-grande/diets',
      '/celebrities/by-id/abc-123',
      '/celebrities?cursor=x',
    ]) {
      const request = createMockRequest({ url, headers: {} });
      await getFirstHook(app)(request, mockReply);
    }
  });

  it('still enforces auth on non-public paths when /celebrities/* is public', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { publicPaths: ['/celebrities', '/celebrities/*'] });

    const request = createMockRequest({ url: '/recipes/abc/personalized', headers: {} });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(
      'Missing or malformed Authorization header',
    );
  });

  // Regression: FIX-STAGING-CONTENT-BASEDIETS-PUBLIC-001 — base_diets is the same
  // content-service catalog tier as celebrities. meal-plan-engine's content_client
  // and BFF /api/base-diets/:id both call token-less. FIX-STAGING-CATALOG-PUBLIC-001
  // added /celebrities* but missed /base-diets* → internal/JWKS mode (staging) 401'd
  // the base-diets fetch and meal-plan generation failed. Locks the wildcard for
  // /base-diets/:id and /base-diets/:id/recipes.
  it('skips verification for public catalog path /base-diets and /base-diets/*', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { publicPaths: ['/base-diets', '/base-diets/*'] });

    for (const url of [
      '/base-diets',
      '/base-diets/09d4aa19-5f90-45c1-b9a8-6f1075bef459',
      '/base-diets/09d4aa19-5f90-45c1-b9a8-6f1075bef459/recipes',
      '/base-diets/abc/recipes?limit=100',
    ]) {
      const request = createMockRequest({ url, headers: {} });
      // No Authorization header — must NOT throw because path is public.
      await getFirstHook(app)(request, mockReply);
    }
  });

  it('still enforces auth on /recipes/:id/personalized when /base-diets/* is public', async () => {
    const app = createMockApp();
    registerJwtAuth(app, {
      publicPaths: ['/celebrities', '/celebrities/*', '/base-diets', '/base-diets/*'],
    });

    const request = createMockRequest({ url: '/recipes/abc/personalized', headers: {} });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(
      'Missing or malformed Authorization header',
    );
  });
});

// CHORE-MOBILE-AUTH-TOKEN-STRATEGY-001 — internal HS256 mode. Verifies the
// internal access token issued by user-service (mirrors meal-plan-engine's
// PyJWT contract: HS256, require sub/exp/token_use, token_use === 'access').
describe('registerJwtAuth — internal HS256 mode', () => {
  const originalEnv = process.env;
  const SECRET = 'test-internal-secret-32-bytes-minimum-xx';
  const secretBytes = new TextEncoder().encode(SECRET);

  async function makeInternalToken(opts: {
    sub?: string;
    tokenUse?: string;
    expSecondsFromNow?: number;
    issuer?: string;
  }): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {};
    if (opts.tokenUse !== undefined) claims['token_use'] = opts.tokenUse;
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setIssuer(opts.issuer ?? 'celebbase-user-service')
      .setExpirationTime(now + (opts.expSecondsFromNow ?? 900));
    if (opts.sub !== undefined) jwt.setSubject(opts.sub);
    return jwt.sign(secretBytes);
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['INTERNAL_JWT_SECRET'] = SECRET;
    delete process.env['INTERNAL_JWKS_URI'];
    delete process.env['JWKS_URI'];
    delete process.env['JWT_ISSUER'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts a valid internal access token and sets userId to sub', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeInternalToken({ sub: 'user-123', tokenUse: 'access' });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await getFirstHook(app)(request, mockReply);

    expect((request as FastifyRequest & { userId: string }).userId).toBe('user-123');
  });

  it('rejects a refresh token (token_use !== access)', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeInternalToken({ sub: 'user-123', tokenUse: 'refresh' });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(/token_use/);
  });

  it('rejects an expired token', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeInternalToken({
      sub: 'user-123',
      tokenUse: 'access',
      expSecondsFromNow: -60,
    });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow();
  });

  it('rejects a token missing required claims (no token_use)', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeInternalToken({ sub: 'user-123' });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow();
  });

  it('rejects a token with a mismatched issuer', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeInternalToken({
      sub: 'user-123',
      tokenUse: 'access',
      issuer: 'celebbase-internal', // service-to-service issuer, not the user-token issuer
    });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow();
  });

  it('rejects a token signed with the wrong secret', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const wrong = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setSubject('user-123')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('a-different-secret-value-padding-xx'));
    const request = createMockRequest({ headers: { authorization: `Bearer ${wrong}` } });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow();
  });

  it('throws when no Authorization header', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const request = createMockRequest({ headers: {} });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(
      'Missing or malformed Authorization header',
    );
  });

  it('skips verification for public paths', async () => {
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal', publicPaths: ['/celebrities', '/celebrities/*'] });

    for (const url of ['/health', '/celebrities', '/celebrities/ariana-grande']) {
      const request = createMockRequest({ url, headers: {} });
      await getFirstHook(app)(request, mockReply);
    }
  });

  it('falls back to stub in non-production when INTERNAL_JWT_SECRET is unset', () => {
    delete process.env['INTERNAL_JWT_SECRET'];
    process.env['NODE_ENV'] = 'test';

    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    expect(app.log.warn).toHaveBeenCalledWith(expect.stringContaining('STUB mode'));
  });

  it('exits in production when INTERNAL_JWT_SECRET is unset', () => {
    delete process.env['INTERNAL_JWT_SECRET'];
    process.env['NODE_ENV'] = 'production';

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    expect(app.log.fatal).toHaveBeenCalledWith(expect.stringContaining('INTERNAL_JWT_SECRET'));
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

// CHORE-AUTH-ASYMMETRIC-SIGNING-001 Phase 2 — internal mode dual-verify.
// RS256 (user-service JWKS) alongside HS256 (shared secret). The header alg
// dispatches to a different key per alg, so algorithm confusion is impossible.
describe('registerJwtAuth — internal mode RS256 dual-verify', () => {
  const originalEnv = process.env;
  const SECRET = 'test-internal-secret-32-bytes-minimum-xx';
  const JWKS_URI = 'https://user-service.internal/.well-known/jwks.json';
  let privateKey: CryptoKey;
  let publicJwk: JWK;
  let kid: string;
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    const full = await exportJWK(pair.publicKey);
    kid = await calculateJwkThumbprint(full);
    publicJwk = { ...full, alg: 'RS256', use: 'sig', kid };
  });

  async function makeRs256Token(opts: {
    sub?: string;
    tokenUse?: string;
    issuer?: string;
  }): Promise<string> {
    const jwt = new SignJWT(opts.tokenUse !== undefined ? { token_use: opts.tokenUse } : {})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setIssuer(opts.issuer ?? 'celebbase-user-service')
      .setExpirationTime('15m');
    if (opts.sub !== undefined) jwt.setSubject(opts.sub);
    return jwt.sign(privateKey);
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetInternalJwksForTest();
    // Serve the JWKS for any fetch the JWKS client makes.
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterAll(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  it('verifies an RS256 token via the internal JWKS', async () => {
    process.env['INTERNAL_JWKS_URI'] = JWKS_URI;
    delete process.env['INTERNAL_JWT_SECRET'];

    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeRs256Token({ sub: 'user-rs', tokenUse: 'access' });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await getFirstHook(app)(request, mockReply);
    expect((request as FastifyRequest & { userId: string }).userId).toBe('user-rs');
  });

  it('rejects an RS256 token when INTERNAL_JWKS_URI is not configured', async () => {
    process.env['INTERNAL_JWT_SECRET'] = SECRET; // HS256 only
    delete process.env['INTERNAL_JWKS_URI'];

    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeRs256Token({ sub: 'user-rs', tokenUse: 'access' });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(/INTERNAL_JWKS_URI/);
  });

  it('rejects an RS256 refresh token (token_use !== access)', async () => {
    process.env['INTERNAL_JWKS_URI'] = JWKS_URI;
    delete process.env['INTERNAL_JWT_SECRET'];

    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const token = await makeRs256Token({ sub: 'user-rs', tokenUse: 'refresh' });
    const request = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
    await expect(getFirstHook(app)(request, mockReply)).rejects.toThrow(/token_use/);
  });

  it('dual mode: HS256 token still verifies when both RS256 and HS256 configured', async () => {
    process.env['INTERNAL_JWKS_URI'] = JWKS_URI;
    process.env['INTERNAL_JWT_SECRET'] = SECRET;

    const app = createMockApp();
    registerJwtAuth(app, { mode: 'internal' });

    const now = Math.floor(Date.now() / 1000);
    const hsToken = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setSubject('user-hs')
      .setIssuer('celebbase-user-service')
      .setExpirationTime(now + 900)
      .sign(new TextEncoder().encode(SECRET));
    const request = createMockRequest({ headers: { authorization: `Bearer ${hsToken}` } });
    await getFirstHook(app)(request, mockReply);
    expect((request as FastifyRequest & { userId: string }).userId).toBe('user-hs');
  });
});
