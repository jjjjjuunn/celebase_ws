// Native social sign-in verifiers (IMPL-MOBILE-SOCIAL-NATIVE-001).
//
// The mobile app obtains provider id_tokens via NATIVE SDKs
// (expo-apple-authentication / @react-native-google-signin) and posts them to
// /auth/login with a `provider` discriminator. These providers verify the
// token DIRECTLY against the provider's JWKS — Cognito federation is NOT in the
// path, which is what removes the email-immutability bug and gives a native UX.
//
// SECURITY (mirrors the lazy-provision contract in auth.service.ts): identity
// is trusted ONLY because verifyIdToken fails closed on
//   - RS256 signature (provider JWKS, kid-pinned by jose)
//   - issuer (exact match — Google accepts its two canonical spellings)
//   - audience (STRICT: Apple = single bundle ID; Google = our client-ID
//     allowlist, any-match) — this is the forgery barrier. A token minted for a
//     different app has a different aud and is rejected.
//   - exp (clockTolerance 60s)
// The `provider` field is client-supplied and untrusted: it only selects which
// strict verifier runs. There is NO cross-provider fallback.
//
// Identity namespacing: the returned `sub` is prefixed ('apple:' / 'google:')
// so it can be stored in users.cognito_sub (VARCHAR(128) UNIQUE) without ever
// colliding with a real Cognito sub or the other provider's sub.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { UnauthorizedError } from '@celebbase/service-core';
import type pg from 'pg';
import type {
  AuthProvider,
  AuthTokens,
  AuthTokenSubject,
  IdTokenPayload,
} from './auth.service.js';
import { issueInternalTokens } from './auth.service.js';

type DbClient = pg.Pool | pg.PoolClient;

export const APPLE_SUB_PREFIX = 'apple:';
export const GOOGLE_SUB_PREFIX = 'google:';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

// Google mints id_tokens with either issuer spelling; both are canonical and
// must be accepted (advisor reconcile — jose `issuer` array is any-match).
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

type WarnLogger = { warn: (obj: unknown, msg: string) => void } | undefined;

/**
 * Sign in with Apple — verifies the native identityToken.
 * `aud` is the single iOS bundle ID; email may be absent on re-sign-in (the
 * caller resolves the user by `sub` in that case — see auth.service.login).
 */
export class AppleAuthProvider implements AuthProvider {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly bundleId: string;
  private readonly log: WarnLogger;

  // jwksUri is injectable for tests ONLY; production omits it and the canonical
  // Apple endpoint is used. The issuer + audience checks below are NOT
  // configurable — they are the forgery barrier and must not be operator-tunable.
  constructor(config: { bundleId: string; jwksUri?: string; log?: WarnLogger }) {
    this.bundleId = config.bundleId;
    this.jwks = createRemoteJWKSet(new URL(config.jwksUri ?? APPLE_JWKS_URI));
    this.log = config.log;
  }

  async verifyIdToken(idToken: string): Promise<IdTokenPayload> {
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: APPLE_ISSUER,
        audience: this.bundleId,
        algorithms: ['RS256'],
        clockTolerance: 60,
      });
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedError('Missing sub claim');
      }
      // Apple omits `email` on re-sign-in; the caller looks the user up by sub
      // when email is empty, and rejects first-time sign-in without it.
      const email = typeof payload['email'] === 'string' ? payload['email'] : '';
      return { sub: `${APPLE_SUB_PREFIX}${payload.sub}`, email };
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      const reason =
        err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
      this.log?.warn({ reason, provider: 'apple' }, 'social_auth_failed');
      throw new UnauthorizedError('Invalid or expired id token');
    }
  }

  async issueTokens(client: DbClient, subject: AuthTokenSubject): Promise<AuthTokens> {
    return issueInternalTokens(client, subject);
  }
}

/**
 * Sign in with Google — verifies the native idToken.
 * `aud` must match one of our configured Google OAuth client IDs (allowlist).
 * Google always supplies a verified `email` for sign-in tokens, so it is
 * required here (unlike Apple).
 */
export class GoogleAuthProvider implements AuthProvider {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly allowedClientIds: string[];
  private readonly log: WarnLogger;

  // jwksUri is injectable for tests ONLY (see AppleAuthProvider). issuer +
  // audience checks below are the forgery barrier — never operator-tunable.
  constructor(config: { allowedClientIds: string[]; jwksUri?: string; log?: WarnLogger }) {
    this.allowedClientIds = config.allowedClientIds;
    this.jwks = createRemoteJWKSet(new URL(config.jwksUri ?? GOOGLE_JWKS_URI));
    this.log = config.log;
  }

  async verifyIdToken(idToken: string): Promise<IdTokenPayload> {
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: GOOGLE_ISSUERS,
        audience: this.allowedClientIds,
        algorithms: ['RS256'],
        clockTolerance: 60,
      });
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedError('Missing sub claim');
      }
      if (typeof payload['email'] !== 'string' || !payload['email']) {
        throw new UnauthorizedError('Missing email claim');
      }
      return { sub: `${GOOGLE_SUB_PREFIX}${payload.sub}`, email: payload['email'] };
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      const reason =
        err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
      this.log?.warn({ reason, provider: 'google' }, 'social_auth_failed');
      throw new UnauthorizedError('Invalid or expired id token');
    }
  }

  async issueTokens(client: DbClient, subject: AuthTokenSubject): Promise<AuthTokens> {
    return issueInternalTokens(client, subject);
  }
}

/**
 * Parse the comma-separated GOOGLE_CLIENT_IDS allowlist. Returns null when
 * unset/empty so the caller fails closed (no Google provider registered →
 * SOCIAL_PROVIDER_NOT_CONFIGURED). Format is validated at boot by env.ts.
 */
export function parseGoogleClientIds(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return ids.length > 0 ? ids : null;
}
