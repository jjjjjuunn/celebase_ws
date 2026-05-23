// Apple "Sign in with Apple" server-to-server token client (FEAT-APPLE-REVOKE-001).
//
// App Store Guideline 4.8.1 requires apps offering Sign in with Apple to revoke
// the user's Apple token when they delete their account. Apple has NO client-side
// revoke (expo-apple-authentication exposes none); revocation is a server-to-server
// call to https://appleid.apple.com/auth/revoke authenticated by a client_secret
// JWT signed with the team's Sign-in-with-Apple private key (.p8, ES256).
//
// Flow this client supports:
//   1. exchangeAuthorizationCode(code) — at sign-in, trade the native sheet's
//      one-time authorizationCode for a long-lived refresh_token (stored encrypted).
//   2. revokeRefreshToken(refreshToken) — on account deletion, revoke that token.
//
// SECURITY:
//   - client_secret JWT is minted PER CALL with a 5-minute TTL (advisor): every
//     minute over what's needed is a replay window if the JWT leaks.
//   - Errors are SANITIZED — the authorizationCode / refresh_token / client_secret
//     are never placed in an Error message (they must not reach logs). Only the
//     operation name + HTTP status + Apple's error CODE are surfaced.

import { SignJWT, importPKCS8 } from 'jose';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
// 5 minutes — minted per call. Apple permits up to 6 months; we want the
// smallest viable replay window (advisor security sharpening).
const CLIENT_SECRET_TTL_SEC = 300;
const REQUEST_TIMEOUT_MS = 5000;

export interface AppleOAuthConfig {
  /** Apple Developer Team ID (client_secret `iss`). */
  teamId: string;
  /** Key ID of the Sign-in-with-Apple .p8 key (JWT header `kid`). */
  keyId: string;
  /** Services ID / client_id (client_secret `sub` + the OAuth client_id). */
  servicesId: string;
  /** PKCS#8 PEM of the .p8 private key. Literal "\n" escapes are normalized. */
  privateKeyPem: string;
}

/** Thrown on any Apple token/revoke failure. Message is always sanitized. */
export class AppleOAuthError extends Error {
  override readonly name = 'AppleOAuthError';
}

export interface AppleOAuthClient {
  /** Trade a one-time authorization code for a refresh_token. */
  exchangeAuthorizationCode(code: string): Promise<string>;
  /** Revoke a previously obtained refresh_token (idempotent at Apple). */
  revokeRefreshToken(refreshToken: string): Promise<void>;
}

/**
 * Build the client config from env, or null when Apple revocation is not
 * configured (all four vars unset — env.ts enforces all-or-nothing). A null
 * return means callers skip exchange/revoke (deletion still soft-deletes).
 */
export function appleOAuthConfigFromEnv(env: {
  APPLE_TEAM_ID?: string | undefined;
  APPLE_KEY_ID?: string | undefined;
  APPLE_SERVICES_ID?: string | undefined;
  APPLE_PRIVATE_KEY?: string | undefined;
}): AppleOAuthConfig | null {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICES_ID, APPLE_PRIVATE_KEY } = env;
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_SERVICES_ID || !APPLE_PRIVATE_KEY) {
    return null;
  }
  return {
    teamId: APPLE_TEAM_ID,
    keyId: APPLE_KEY_ID,
    servicesId: APPLE_SERVICES_ID,
    privateKeyPem: APPLE_PRIVATE_KEY,
  };
}

export function createAppleOAuthClient(config: AppleOAuthConfig | null): AppleOAuthClient | null {
  return config === null ? null : new AppleOAuthClientImpl(config);
}

class AppleOAuthClientImpl implements AppleOAuthClient {
  constructor(private readonly config: AppleOAuthConfig) {}

  private async buildClientSecret(): Promise<string> {
    // .p8 contents stored in env may carry literal "\n" — normalize to real
    // newlines so the PEM parses.
    const pem = this.config.privateKeyPem.replace(/\\n/g, '\n');
    const key = await importPKCS8(pem, 'ES256');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId, typ: 'JWT' })
      .setIssuer(this.config.teamId)
      .setSubject(this.config.servicesId)
      .setAudience(APPLE_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + CLIENT_SECRET_TTL_SEC)
      .sign(key);
  }

  async exchangeAuthorizationCode(code: string): Promise<string> {
    const clientSecret = await this.buildClientSecret();
    const body = new URLSearchParams({
      client_id: this.config.servicesId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });
    const json = await this.post(APPLE_TOKEN_URL, body, 'exchange');
    const refreshToken = json['refresh_token'];
    if (typeof refreshToken !== 'string' || refreshToken === '') {
      throw new AppleOAuthError('Apple exchange response missing refresh_token');
    }
    return refreshToken;
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const clientSecret = await this.buildClientSecret();
    const body = new URLSearchParams({
      client_id: this.config.servicesId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    });
    // Apple returns 200 with an empty body on success.
    await this.post(APPLE_REVOKE_URL, body, 'revoke');
  }

  private async post(
    url: string,
    body: URLSearchParams,
    op: 'exchange' | 'revoke',
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
        signal: controller.signal,
      });
    } catch {
      // Network error / timeout. Never echo the body (carries client_secret + code).
      throw new AppleOAuthError(`Apple ${op} request failed (network/timeout)`);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new AppleOAuthError(`Apple ${op} failed (${String(res.status)}: ${extractAppleError(text)})`);
    }
    if (text === '') return {};
    return parseJsonObject(text, op);
  }
}

/** Pull Apple's `error` code from an error body without leaking the raw body. */
function extractAppleError(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
      const code = (parsed as Record<string, unknown>)['error'];
      if (typeof code === 'string' && code !== '') return code;
    }
    return 'unknown';
  } catch {
    return 'non_json';
  }
}

function parseJsonObject(text: string, op: 'exchange' | 'revoke'): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppleOAuthError(`Apple ${op} returned invalid JSON`);
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new AppleOAuthError(`Apple ${op} returned a non-object body`);
  }
  return parsed as Record<string, unknown>;
}
