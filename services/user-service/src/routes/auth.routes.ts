import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  ValidationError,
  UnauthorizedError,
  SocialProviderNotConfiguredError,
  type PhiKeyProvider,
} from '@celebbase/service-core';
import type { AuthProvider } from '../services/auth.service.js';
import * as authService from '../services/auth.service.js';
import * as refreshTokenRepo from '../repositories/refresh-token.repository.js';
import type { AppleOAuthClient } from '../services/apple-oauth.js';
import { storeAppleRefreshToken } from '../services/apple-token-store.js';
import { emitAuthLog, hashId } from '../lib/auth-log.js';

const SignupSchema = z.object({
  email: z.string().email().max(255),
  // Optional (IMPL-MOBILE-SIGNUP-DISPLAYNAME-001) — mirrors shared-types
  // SignupRequestSchema. When absent the service fills a neutral default.
  display_name: z.string().min(1).max(100).optional(),
  id_token: z.string().optional(),
});

const LoginSchema = z.object({
  // Optional — the dev stub uses it; id_token flows derive email from the
  // verified token (native Apple may omit it on re-sign-in).
  email: z.string().email().max(255).optional(),
  id_token: z.string().optional(),
  // Selects the verifier. Absent / 'cognito' → the injected authProvider
  // (Cognito in prod, dev stub locally). 'apple' / 'google' → the matching
  // native social verifier, or SOCIAL_PROVIDER_NOT_CONFIGURED if unwired.
  provider: z.enum(['cognito', 'apple', 'google']).optional(),
  // Apple ONLY — one-time authorization code (FEAT-APPLE-REVOKE-001). Exchanged
  // for a refresh_token (stored encrypted) so deletion can revoke it.
  apple_authorization_code: z.string().optional(),
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
    // Native social verifiers, wired only when their env is configured. Absent
    // keys fail closed via SOCIAL_PROVIDER_NOT_CONFIGURED (no fallback).
    socialProviders?: Partial<Record<'apple' | 'google', AuthProvider>>;
    rateLimits?: Partial<AuthRateLimits>;
    // FEAT-APPLE-REVOKE-001 — when both present, a successful Apple login with an
    // apple_authorization_code exchanges + stores the refresh_token (best-effort).
    appleOAuth?: AppleOAuthClient | null;
    phiKeyProvider?: PhiKeyProvider;
  },
): Promise<void> {
  const { pool, authProvider, appleOAuth, phiKeyProvider } = options;
  const socialProviders = options.socialProviders ?? {};
  const rateLimits: AuthRateLimits = {
    ...DEFAULT_RATE_LIMITS,
    ...(options.rateLimits ?? {}),
  };

  // Dispatch the login verifier by the client-supplied `provider`. The field
  // is untrusted for identity — each provider's verifyIdToken fails closed on
  // iss/aud/exp, so a forged `provider` only chooses which strict verifier
  // rejects the token. No cross-provider fallback.
  function pickLoginProvider(kind: 'cognito' | 'apple' | 'google' | undefined): AuthProvider {
    if (kind === 'apple' || kind === 'google') {
      const sp = socialProviders[kind];
      if (!sp) throw new SocialProviderNotConfiguredError(kind);
      return sp;
    }
    return authProvider;
  }

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
      const provider = pickLoginProvider(parsed.data.provider);
      const result = await authService.login(
        pool,
        provider,
        parsed.data,
        request.log,
        request.id,
      );
      emitAuthLog(request.log, 'auth.internal_token.issued', {
        flow: 'login',
        provider: parsed.data.provider ?? 'cognito',
        requestId: request.id,
      });
      // FEAT-APPLE-REVOKE-001 — capture the Apple refresh_token for later
      // revocation. Best-effort + audited; never blocks the login response.
      if (
        parsed.data.provider === 'apple' &&
        parsed.data.apple_authorization_code &&
        appleOAuth &&
        phiKeyProvider
      ) {
        await storeAppleRefreshToken({
          pool,
          userId: result.user.id,
          authorizationCode: parsed.data.apple_authorization_code,
          appleOAuth,
          keyProvider: phiKeyProvider,
          log: request.log,
          requestId: request.id,
        });
      }
      return result;
    },
  );

  // IMPL-ACCOUNT-RESTORE-001 — within-grace restore. Public route (registered in
  // index.ts publicPaths); the verified id_token IS the auth. Same rate-limit as
  // login (it can probe account existence). Body shape mirrors login.
  app.post(
    '/auth/restore',
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
      const provider = pickLoginProvider(parsed.data.provider);
      const userAgent = request.headers['user-agent'];
      const result = await authService.restore(
        pool,
        provider,
        parsed.data,
        request.log,
        request.id,
        { ip: request.ip, ...(typeof userAgent === 'string' ? { userAgent } : {}) },
      );
      // FEAT-APPLE-REVOKE-001 — mirror the login route: re-capture the Apple
      // refresh_token on restore too, else a restore→delete sequence couldn't
      // revoke at Apple (App Store 4.8.1) until the user's next normal login.
      // Best-effort + audited; never blocks the restore response.
      if (
        parsed.data.provider === 'apple' &&
        parsed.data.apple_authorization_code &&
        appleOAuth &&
        phiKeyProvider
      ) {
        await storeAppleRefreshToken({
          pool,
          userId: result.user.id,
          authorizationCode: parsed.data.apple_authorization_code,
          appleOAuth,
          keyProvider: phiKeyProvider,
          log: request.log,
          requestId: request.id,
        });
      }
      emitAuthLog(request.log, 'auth.internal_token.issued', {
        flow: 'restore',
        provider: parsed.data.provider ?? 'cognito',
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
