import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import type { AuthProvider } from '../services/auth.service.js';
import * as authService from '../services/auth.service.js';
import { emitAuthLog, hashId } from '../lib/auth-log.js';

const SignupSchema = z.object({
  email: z.string().email().max(255),
  display_name: z.string().min(1).max(100),
  id_token: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email().max(255),
  id_token: z.string().optional(),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const LogoutSchema = z.object({
  refresh_token: z.string().optional(),
});

// Test-mode bypass. @fastify/rate-limit v10 dropped the per-route `skip`
// option (silently ignored); use `allowList` callback instead.
const testAllowList = (): boolean => process.env['NODE_ENV'] === 'test';

// eslint-disable-next-line @typescript-eslint/require-await
export async function authRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool; authProvider: AuthProvider },
): Promise<void> {
  const { pool, authProvider } = options;

  app.post(
    '/auth/signup',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
          allowList: testAllowList,
        },
      },
    },
    async (request: FastifyRequest) => {
      const parsed = SignupSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          issue: e.message,
        })));
      }
      const result = await authService.signup(pool, authProvider, parsed.data);
      emitAuthLog(request.log, 'auth.internal_token.issued', {
        flow: 'signup',
        requestId: request.id,
      });
      return result;
    },
  );

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          // IP-only. Distributed credential-replay (rotating IPs) is an accepted
          // residual risk until Phase C adds hmac(email) layer + Cognito
          // Advanced Security.
          max: 5,
          timeWindow: '1 minute',
          allowList: testAllowList,
        },
      },
    },
    async (request: FastifyRequest) => {
      const parsed = LoginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          issue: e.message,
        })));
      }
      const result = await authService.login(pool, authProvider, parsed.data);
      emitAuthLog(request.log, 'auth.internal_token.issued', {
        flow: 'login',
        requestId: request.id,
      });
      return result;
    },
  );

  app.post(
    '/auth/refresh',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          // Body is parsed by the preHandler phase, so the rate-limit check
          // must run there to read `refresh_token`. Default is onRequest.
          hook: 'preHandler',
          keyGenerator: (req: FastifyRequest): string => {
            const body = req.body as { refresh_token?: unknown } | undefined;
            const token = typeof body?.refresh_token === 'string' ? body.refresh_token : undefined;
            if (!token) return req.ip;
            // 16-hex prefix — sufficient entropy to partition rate-limit
            // buckets without leaking a full fingerprint. Key stays in the
            // in-memory rate-limit store only; never logged (Rule #8).
            const fp = createHash('sha256').update(token).digest('hex').slice(0, 16);
            return `${fp}:${req.ip}`;
          },
          allowList: testAllowList,
        },
      },
    },
    async (request: FastifyRequest) => {
      const parsed = RefreshSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          issue: e.message,
        })));
      }
      const result = await authService.refresh(authProvider, parsed.data.refresh_token);
      emitAuthLog(request.log, 'auth.internal_token.issued', {
        flow: 'refresh',
        requestId: request.id,
      });
      return result;
    },
  );

  // POST /auth/logout — stateless, best-effort audit log.
  // Phase B has no refresh_tokens table, so there is nothing to revoke.
  // The endpoint exists to (a) record the client intent for audit trails,
  // and (b) provide a stable contract the BFF can call on cookie clear.
  // TODO(IMPL-010-f): add refresh_tokens table + jti blacklist for real revocation.
  app.post(
    '/auth/logout',
    async (request: FastifyRequest, reply) => {
      // Body is optional; validate if present so a malformed payload still 400s.
      if (request.body !== undefined && request.body !== null) {
        const parsed = LogoutSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            issue: e.message,
          })));
        }
      }
      // request.userId is injected by registerJwtAuth (service-core). Logout
      // is NOT in PUBLIC_PATHS, so an unauthenticated call would have thrown
      // 401 before reaching here.
      const userId = (request as FastifyRequest & { userId?: string }).userId;
      if (typeof userId === 'string' && userId.length > 0) {
        emitAuthLog(request.log, 'auth.logout', {
          user_id_hash: hashId(userId),
          requestId: request.id,
        });
      }
      return reply.status(204).send();
    },
  );
}
