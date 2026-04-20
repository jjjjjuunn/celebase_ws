import type { NextRequest } from 'next/server';
import { errors as joseErrors, jwtVerify } from 'jose';
import {
  createLogger,
  SessionExpiredError,
  toBffErrorResponse,
  type BffError,
} from './bff-error.js';

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

export function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

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
    const token = req.cookies.get('cb_access')?.value;
    if (token === undefined || token === '') {
      return unauthorizedResponse(
        requestId,
        'UNAUTHORIZED',
        'Missing session cookie',
        false,
      );
    }
    let session: Session;
    try {
      session = await verifyAccessToken(token);
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        // Client should clear cookie locally and re-login via Cognito.
        // TODO(Phase C): attempt silent refresh before returning 401.
        return unauthorizedResponse(
          requestId,
          'TOKEN_EXPIRED',
          'Access token expired',
          true,
        );
      }
      log.warn({ err }, 'Token verification failed');
      return unauthorizedResponse(
        requestId,
        'UNAUTHORIZED',
        'Invalid session',
        false,
      );
    }
    try {
      const res = await handler(req, session);
      return withRequestId(res, requestId);
    } catch (err) {
      // D29: fetchBff from an API route handler throws SessionExpiredError
      // on BE 401. API routes must return 401 JSON (not redirect) — clients
      // expect a JSON body + X-Token-Expired for the query-client refresh
      // interceptor, not a 307 Location.
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
