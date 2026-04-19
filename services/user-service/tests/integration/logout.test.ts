// /auth/logout integration tests (IMPL-010-e).
//
// Verifies: 204 response, `auth.logout` structured log emission, and that an
// unauthenticated-in-production call would 401 (simulated by omitting the
// userId-injection hook rather than wiring a full JWKS verifier).
//
// Logger capture: Fastify creates a child logger per request, so a post-hoc
// monkey-patch on `app.log.info` does NOT propagate. We pass a minimal
// synchronous logger whose `child()` returns the same instance — every
// `request.log.info(obj, msg)` call appends to `captured[]` immediately.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type pg from 'pg';
import { authRoutes } from '../../src/routes/auth.routes.js';
import type { AuthProvider } from '../../src/services/auth.service.js';
import { DevAuthProvider } from '../../src/services/auth.service.js';

const mockPool = {} as pg.Pool;

interface CapturedLog {
  event?: string;
  requestId?: unknown;
  user_id_hash?: unknown;
  [key: string]: unknown;
}

interface BuildOptions {
  injectUserId?: string | undefined;
  requireAuth?: boolean;
}

// Minimal synchronous logger compatible with Fastify 5's loggerInstance
// contract. Captures every `.info(obj, msg)` call across parent + child
// loggers into the shared `captured` array.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCaptureLogger(captured: CapturedLog[]): any {
  const logger = {
    level: 'info',
    silent: () => undefined,
    info: (obj: unknown, _msg?: string): void => {
      if (typeof obj === 'object' && obj !== null) {
        captured.push(obj as CapturedLog);
      }
    },
    error: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    fatal: () => undefined,
    child: () => logger,
  };
  return logger;
}

async function buildApp(
  captured: CapturedLog[],
  opts: BuildOptions = {},
): Promise<FastifyInstance> {
  const loggerInstance = makeCaptureLogger(captured);
  // disableRequestLogging: Fastify's built-in req/res logs include the raw
  // body, which collides with our Rule #8 assertion on `auth.*` events.
  // Production uses service-core's logger with redaction; here we only want
  // to inspect logs WE emit via emitAuthLog().
  const app = Fastify({ loggerInstance, disableRequestLogging: true });

  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // Simulate the JWT middleware — inject userId iff configured.
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

  const provider: AuthProvider = new DevAuthProvider();
  await app.register(authRoutes, { pool: mockPool, authProvider: provider });
  return app;
}

describe('POST /auth/logout', () => {
  let captured: CapturedLog[];
  let app: FastifyInstance;

  beforeEach(() => {
    captured = [];
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 204 and emits auth.logout when the JWT middleware has set userId', async () => {
    app = await buildApp(captured, { injectUserId: 'user-uuid-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub' },
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');

    const logoutLog = captured.find((l) => l.event === 'auth.logout');
    expect(logoutLog).toBeDefined();
    expect(typeof logoutLog?.user_id_hash).toBe('string');
    expect((logoutLog?.user_id_hash as string).length).toBe(8);
    expect(typeof logoutLog?.requestId).toBe('string');
    // Rule #8: raw user id must never appear in the log line.
    expect(JSON.stringify(logoutLog)).not.toContain('user-uuid-42');
  });

  it('returns 401 when the auth middleware rejects an unauthenticated request (prod-like)', async () => {
    app = await buildApp(captured, { requireAuth: true });
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(res.statusCode).toBe(401);
    // No auth.logout event should be emitted when the request is rejected upstream.
    expect(captured.find((l) => l.event === 'auth.logout')).toBeUndefined();
  });

  it('accepts and ignores an optional refresh_token body (Phase B stateless)', async () => {
    app = await buildApp(captured, { injectUserId: 'user-42' });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer stub', 'content-type': 'application/json' },
      payload: { refresh_token: 'rt-to-ignore' },
    });

    expect(res.statusCode).toBe(204);
    // Rule #8: the raw refresh token must not appear in captured logs.
    expect(JSON.stringify(captured)).not.toContain('rt-to-ignore');
  });

  it('400s on a malformed body (schema guard holds even though body is optional)', async () => {
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
});
