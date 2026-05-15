import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError, UnauthorizedError } from '@celebbase/service-core';
import type { AuthProvider } from '../services/auth.service.js';
import * as authService from '../services/auth.service.js';
import * as refreshTokenRepo from '../repositories/refresh-token.repository.js';
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
  refresh_token: z.string().min(1),
});

// Test-mode bypass. @fastify/rate-limit v10 dropped the per-route `skip`
// option (silently ignored); use `allowList` callback instead.
const testAllowList = (): boolean => process.env['NODE_ENV'] === 'test';

// IMPL-MOBILE-AUTH-002b: per-route rate-limit overrides via env. Defaults
// fall through when env is unset so existing call sites that don't pass
// rateLimits still get the post-mobile-pivot baseline (Plan v5 §58 / DECISION §3).
export interface AuthRateLimits {
  signup: number;
  login: number;
  refresh: number;
  logout: number;
}

const DEFAULT_RATE_LIMITS: AuthRateLimits = {
  signup: 3,
  login: 10,
  refresh: 30,
  logout: 20,
};

// eslint-disable-next-line @typescript-eslint/require-await
export async function authRoutes(
  app: FastifyInstance,
  options: {
    pool: pg.Pool;
    authProvider: AuthProvider;
    rateLimits?: Partial<AuthRateLimits>;
  },
): Promise<void> {
  const { pool, authProvider } = options;
  const rateLimits: AuthRateLimits = {
    ...DEFAULT_RATE_LIMITS,
    ...(options.rateLimits ?? {}),
  };

  app.post(
    '/auth/signup',
    {
      config: {
        rateLimit: {
          max: rateLimits.signup,
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
          max: rateLimits.login,
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
      const result = await authService.login(
        pool,
        authProvider,
        parsed.data,
        request.log,
        request.id,
      );
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
          max: rateLimits.refresh,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (req: FastifyRequest): string => {
            const body = req.body as { refresh_token?: unknown } | undefined;
            const token = typeof body?.refresh_token === 'string' ? body.refresh_token : undefined;
            if (!token) return req.ip;
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
      return authService.performRotation(
        pool,
        parsed.data.refresh_token,
        request.log,
        request.id,
      );
    },
  );

  // POST /auth/logout — Phase C stateful revocation via refresh_tokens table.
  //
  // Mounted under publicPaths in services/user-service/src/index.ts so the
  // root-scope external JWT onRequest hook does NOT run on this route. The
  // handler self-verifies refresh_token (body) AFTER the per-route limiter,
  // satisfying spec §9.3: limiter must run before crypto verify so junk-token
  // DoS attempts are bucketed. userId is derived from the verified sub claim
  // — the refresh_token itself authenticates the request (same model as
  // /auth/refresh), no separate Bearer access token required.
  app.post(
    '/auth/logout',
    {
      config: {
        rateLimit: {
          max: rateLimits.logout,
          timeWindow: '1 minute',
          allowList: testAllowList,
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const parsed = LogoutSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          issue: e.message,
        })));
      }

      // Verify JWT signature + expiry before any DB call (timing-safe).
      // Limiter has already run by this point (onRequest hook in plugin scope).
      let jti: string;
      let userId: string;
      try {
        const verified = await authService.verifyInternalRefresh(parsed.data.refresh_token);
        jti = verified.jti;
        userId = verified.sub;
      } catch {
        throw new UnauthorizedError('Invalid refresh token');
      }

      // Atomic revoke: UPDATE WHERE revoked_at IS NULL RETURNING rotated_to_jti
      const revokeResult = await refreshTokenRepo.revokeForLogout(pool, { jti, userId });

      if (revokeResult === null) {
        // Already revoked — idempotent 204, no chain walk, no log
        return reply.status(204).send();
      }

      let chainLen = 0;
      if (revokeResult.rotatedToJti !== null) {
        chainLen = await refreshTokenRepo.revokeChainForLogout(pool, {
          startJti: revokeResult.rotatedToJti,
          userId,
        });
      }

      emitAuthLog(request.log, 'auth.logout', {
        user_id_hash: hashId(userId),
        jti_hash: jti.slice(0, 8),
        chain_len: 1 + chainLen,
        requestId: request.id,
      });

      return reply.status(204).send();
    },
  );
}
