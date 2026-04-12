/**
 * Tests for JWT middleware (registerJwtAuth).
 *
 * Since jose is an ESM-only package and jest.mock doesn't work well with ESM,
 * we test the middleware behavior by exercising the public API through Fastify hooks.
 * jose is NOT mocked — we test stub mode (no JWKS) and real mode behavior.
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

type HookFn = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

// Dynamic import to work with ESM
let registerJwtAuth: (app: FastifyInstance) => void;

beforeAll(async () => {
  const mod = await import('../../src/middleware/jwt.js');
  registerJwtAuth = mod.registerJwtAuth;
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
});
