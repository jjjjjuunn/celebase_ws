import type { NextRequest } from 'next/server';
import { errors as joseErrors, jwtVerify } from 'jose';
import {
  createLogger,
  SessionExpiredError,
  toBffErrorResponse,
  type BffError,
} from './bff-error.js';
import { readEnv } from './env.js';
import { clearSessionCookies, setSessionCookies } from './cookies.js';
import { attemptSilentRefresh } from './refresh.js';

// Re-exported so existing BFF routes that import readEnv from session.js keep
// working. New code should import from './env.js' directly.
export { readEnv };

export interface Session {
  user_id: string;
  email: string;
  cognito_sub: string;
  raw_token: string;
}

export type ProtectedHandler = (
  req: NextRequest,
  session: Session,
) => Promise<Response> | Response;

export type PublicHandler = (req: NextRequest) => Promise<Response> | Response;

const DEFAULT_DEV_SECRET = 'dev-secret-not-for-prod';
const INTERNAL_ISSUER =
  process.env['INTERNAL_JWT_ISSUER'] ?? 'celebbase-user-service';

const log = createLogger('bff-session');

// Prod requires INTERNAL_JWT_SECRET explicitly; dev falls back to a known
// placeholder so first-run local / jest / typecheck don't crash on missing env.
// INTERNAL_JWT_SECRET_NEXT enables zero-downtime key rotation: verifier tries
// NEXT first, falls back to CURRENT on signature-only failure. See
// docs/runbooks/internal-jwt-rotation.md.
function getVerifierSecrets(): Uint8Array[] {
  const isProd = process.env['NODE_ENV'] === 'production';
  const current = isProd
    ? readEnv('INTERNAL_JWT_SECRET')
    : (process.env['INTERNAL_JWT_SECRET'] ?? DEFAULT_DEV_SECRET);
  const next = process.env['INTERNAL_JWT_SECRET_NEXT'];
  const enc = new TextEncoder();
  return next !== undefined && next !== ''
    ? [enc.encode(next), enc.encode(current)]
    : [enc.encode(current)];
}

// BFF verifies internal HS256 JWTs issued by user-service.
// Cognito id_tokens never reach the BFF directly — user-service exchanges them
// for internal tokens before issuing the cb_access cookie.
export async function verifyAccessToken(token: string): Promise<Session> {
  const secrets = getVerifierSecrets();
  let lastErr: unknown;
  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, secret, {
        issuer: INTERNAL_ISSUER,
        algorithms: ['HS256'],
        clockTolerance: 60,
      });
      return {
        user_id: String(payload.sub ?? ''),
        email: typeof payload['email'] === 'string' ? payload['email'] : '',
        cognito_sub:
          typeof payload['cognito_sub'] === 'string'
            ? payload['cognito_sub']
            : '',
        raw_token: token,
      };
    } catch (err) {
      lastErr = err;
      if (err instanceof joseErrors.JWSSignatureVerificationFailed) continue;
      throw err;
    }
  }
  throw lastErr;
}

// Minimum latency for authenticated handler responses.
// Ensures 200/404/403 responses are indistinguishable by timing, preventing
// enumeration of valid resource IDs (IDOR via timing side-channel).
const MIN_HANDLER_LATENCY_MS = 100;

async function padToMinLatency(startMs: number): Promise<void> {
  const elapsed = performance.now() - startMs;
  const remaining = MIN_HANDLER_LATENCY_MS - elapsed;
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
}

function ensureRequestId(req: NextRequest): string {
  const existing = req.headers.get('x-request-id');
  if (existing !== null && existing !== '') return existing;
  return crypto.randomUUID();
}

function withRequestId(res: Response, requestId: string): Response {
  if (res.headers.get('x-request-id') === null) {
    res.headers.set('X-Request-Id', requestId);
  }
  return res;
}

function unauthorizedResponse(
  requestId: string,
  code: string,
  message: string,
  tokenExpired: boolean,
): Response {
  const body = { error: { code, message, requestId } };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  };
  if (tokenExpired) headers['X-Token-Expired'] = 'true';
  return new Response(JSON.stringify(body), { status: 401, headers });
}

export function createProtectedRoute(
  handler: ProtectedHandler,
): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    const requestId = ensureRequestId(req);
    // Single padding anchor covers verify → refresh → handler → response.
    // Every exit below runs padToMinLatency(handlerStart) so the outer
    // response timing can't distinguish missing-cookie / expired / refresh
    // success vs. handler-level branches.
    const handlerStart = performance.now();

    const token = req.cookies.get('cb_access')?.value;
    if (token === undefined || token === '') {
      await padToMinLatency(handlerStart);
      return unauthorizedResponse(
        requestId,
        'UNAUTHORIZED',
        'Missing session cookie',
        false,
      );
    }

    let session: Session;
    // Holds Set-Cookie headers to append to the final response when silent
    // refresh succeeds. Null when no refresh happened — handler's response
    // flows through unchanged.
    let newCookies: string[] | null = null;
    try {
      session = await verifyAccessToken(token);
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        const refreshCookie = req.cookies.get('cb_refresh')?.value;
        if (refreshCookie === undefined || refreshCookie === '') {
          await padToMinLatency(handlerStart);
          return unauthorizedResponse(
            requestId,
            'TOKEN_EXPIRED',
            'Access token expired',
            true,
          );
        }
        const refreshed = await attemptSilentRefresh(refreshCookie, requestId);
        if (!refreshed.ok) {
          const res = unauthorizedResponse(
            requestId,
            'TOKEN_EXPIRED',
            'Access token expired',
            true,
          );
          for (const c of clearSessionCookies()) {
            res.headers.append('Set-Cookie', c);
          }
          await padToMinLatency(handlerStart);
          return res;
        }
        try {
          // Discriminated union narrows refreshed.newAccess to string — no `!`.
          session = await verifyAccessToken(refreshed.newAccess);
        } catch (verifyErr) {
          log.warn(
            { err: verifyErr },
            'Silent refresh returned unverifiable access token',
          );
          const res = unauthorizedResponse(
            requestId,
            'TOKEN_EXPIRED',
            'Access token expired',
            true,
          );
          for (const c of clearSessionCookies()) {
            res.headers.append('Set-Cookie', c);
          }
          await padToMinLatency(handlerStart);
          return res;
        }
        newCookies = setSessionCookies({
          accessToken: refreshed.newAccess,
          refreshToken: refreshed.newRefresh,
          accessMaxAgeSec: refreshed.accessExpSec,
          refreshMaxAgeSec: refreshed.refreshExpSec,
        });
      } else {
        log.warn({ err }, 'Token verification failed');
        await padToMinLatency(handlerStart);
        return unauthorizedResponse(
          requestId,
          'UNAUTHORIZED',
          'Invalid session',
          false,
        );
      }
    }

    let handlerRes: Response;
    try {
      handlerRes = withRequestId(await handler(req, session), requestId);
    } catch (err) {
      // D29: fetchBff from an API route handler throws SessionExpiredError
      // on BE 401. API routes must return 401 JSON (not redirect) — clients
      // expect a JSON body + X-Token-Expired for the query-client refresh
      // interceptor, not a 307 Location.
      if (err instanceof SessionExpiredError) {
        handlerRes = unauthorizedResponse(
          requestId,
          'TOKEN_EXPIRED',
          'Access token expired',
          true,
        );
        // Second expiry after a successful refresh → the refreshed session
        // is already dead upstream. Drop the newly-issued cookies instead of
        // leaving stale ones on the client.
        if (newCookies !== null) newCookies = null;
        for (const c of clearSessionCookies()) {
          handlerRes.headers.append('Set-Cookie', c);
        }
      } else {
        handlerRes = withRequestId(toBffErrorResponse(err, requestId), requestId);
      }
    }
    if (newCookies !== null) {
      for (const c of newCookies) {
        handlerRes.headers.append('Set-Cookie', c);
      }
    }
    await padToMinLatency(handlerStart);
    return handlerRes;
  };
}

export function createPublicRoute(
  handler: PublicHandler,
): (req: NextRequest) => Promise<Response> {
  return async (req) => {
    const requestId = ensureRequestId(req);
    try {
      const res = await handler(req);
      return withRequestId(res, requestId);
    } catch (err) {
      // Public routes can't refresh — surface the 401 as a normal error
      // envelope. toBffErrorResponse falls through to INTERNAL_ERROR for
      // unknown errors; SessionExpiredError shouldn't occur here (public
      // BE endpoints don't require auth) but we keep the path explicit.
      if (err instanceof SessionExpiredError) {
        return unauthorizedResponse(
          requestId,
          'TOKEN_EXPIRED',
          'Access token expired',
          true,
        );
      }
      return withRequestId(toBffErrorResponse(err, requestId), requestId);
    }
  };
}

export type { BffError };
