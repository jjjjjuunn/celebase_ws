import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff, SessionExpiredError } from '../../_lib/bff-fetch.js';
import { createLogger } from '../../_lib/bff-error.js';
import { createPublicRoute, readEnv } from '../../_lib/session.js';

const COGNITO_TOKEN_ENDPOINT = readEnv('COGNITO_TOKEN_ENDPOINT');
const COGNITO_CLIENT_ID = readEnv('COGNITO_CLIENT_ID');
const COGNITO_CLIENT_SECRET = readEnv('COGNITO_CLIENT_SECRET');
const COGNITO_REDIRECT_URI = readEnv('COGNITO_REDIRECT_URI');
const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;

const log = createLogger('bff-auth-callback');

function sessionCookies(accessToken: string, refreshToken: string): string[] {
  const secure = process.env['NODE_ENV'] === 'production' ? '; Secure' : '';
  return [
    `cb_access=${accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${secure}`,
    `cb_refresh=${refreshToken}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=2592000${secure}`,
  ];
}

function clearOAuthCookies(): string[] {
  return [
    'cb_oauth_state=; HttpOnly; SameSite=Lax; Path=/api/auth/callback; Max-Age=0',
    'cb_oauth_verifier=; HttpOnly; SameSite=Lax; Path=/api/auth/callback; Max-Age=0',
    'cb_return_to=; HttpOnly; SameSite=Lax; Path=/api/auth/callback; Max-Age=0',
  ];
}

function makeRedirect(req: NextRequest, path: string): Response {
  const dest = new URL(path, req.nextUrl.origin);
  const headers = new Headers();
  headers.set('Location', dest.toString());
  for (const cookie of clearOAuthCookies()) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 302, headers });
}

// Decode JWT payload claims without verifying signature.
// Signature verification is the user-service's responsibility.
function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) {
    throw new Error('malformed JWT');
  }
  const padding = '='.repeat((4 - (parts[1].length % 4)) % 4);
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + padding;
  return JSON.parse(atob(b64)) as Record<string, unknown>;
}

export const GET = createPublicRoute(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const storedState = req.cookies.get('cb_oauth_state')?.value;
  const codeVerifier = req.cookies.get('cb_oauth_verifier')?.value;
  const returnToEncoded = req.cookies.get('cb_return_to')?.value;
  const returnTo =
    returnToEncoded !== undefined ? decodeURIComponent(returnToEncoded) : '/dashboard';

  if (
    code === null ||
    state === null ||
    storedState === undefined ||
    codeVerifier === undefined
  ) {
    return makeRedirect(req, '/login?error=MISSING_PARAMS');
  }

  // Constant-time string comparison isn't available natively in Node; since
  // state is a UUID (not a secret MAC), a strict equality check is sufficient
  // to guard against CSRF. Timing attacks on a random UUID provide no benefit.
  if (state !== storedState) {
    log.warn({ requestId: req.headers.get('x-request-id') }, 'OAuth state mismatch');
    return makeRedirect(req, '/login?error=STATE_MISMATCH');
  }

  // Exchange authorization code for Cognito tokens using client_secret_basic
  const credentials = btoa(`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET}`);
  const tokenRes = await fetch(COGNITO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: COGNITO_REDIRECT_URI,
      client_id: COGNITO_CLIENT_ID,
      code_verifier: codeVerifier,
    }).toString(),
    signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
  }).catch((err: unknown) => {
    log.warn({ err }, 'Cognito token exchange failed');
    return null;
  });

  if (tokenRes === null || !tokenRes.ok) {
    log.warn({ status: tokenRes?.status }, 'Cognito token endpoint returned error');
    return makeRedirect(req, '/login?error=TOKEN_EXCHANGE_FAILED');
  }

  const tokenBody = await tokenRes.json().catch((err: unknown) => {
    log.warn({ err }, 'Failed to parse Cognito token response');
    return null;
  }) as Record<string, unknown> | null;

  const idToken =
    typeof tokenBody?.['id_token'] === 'string' ? tokenBody['id_token'] : null;
  if (idToken === null) {
    log.warn({}, 'Cognito response missing id_token');
    return makeRedirect(req, '/login?error=TOKEN_EXCHANGE_FAILED');
  }

  let email: string;
  try {
    const claims = decodeJwtClaims(idToken);
    const emailClaim = claims['email'];
    if (typeof emailClaim !== 'string' || emailClaim === '') {
      throw new Error('email claim missing or empty');
    }
    email = emailClaim;
  } catch (err: unknown) {
    log.warn({ err }, 'Failed to decode id_token claims');
    return makeRedirect(req, '/login?error=TOKEN_EXCHANGE_FAILED');
  }

  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;

  let loginResult: Awaited<ReturnType<typeof fetchBff<typeof schemas.LoginResponseSchema._type>>>;
  try {
    loginResult = await fetchBff('user', '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, id_token: idToken }),
      schema: schemas.LoginResponseSchema,
      requestId,
      forwardedFor,
    });
  } catch (err: unknown) {
    // Covers SessionExpiredError (user-service returned 401) + network errors.
    // Neither is a session-expiry in the OAuth context — treat as auth failure.
    if (!(err instanceof SessionExpiredError)) {
      log.warn({ err }, 'Unexpected error during user-service auth login');
    }
    return makeRedirect(req, '/login?error=AUTH_FAILED');
  }

  if (!loginResult.ok) {
    log.warn({ code: loginResult.error.code }, 'user-service /auth/login rejected OAuth login');
    return makeRedirect(req, '/login?error=AUTH_FAILED');
  }

  const { access_token, refresh_token } = loginResult.data;
  const responseHeaders = new Headers({ Location: new URL(returnTo, req.nextUrl.origin).toString() });
  for (const cookie of [...sessionCookies(access_token, refresh_token), ...clearOAuthCookies()]) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 302, headers: responseHeaders });
});
