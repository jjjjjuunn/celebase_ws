import type { NextRequest } from 'next/server';
import { errors as joseErrors, jwtVerify } from 'jose';
import {
  createLogger,
  toBffErrorResponse,
  type BffError,
} from './bff-error.js';

export interface Session {
  user_id: string;
  email: string;
  cognito_sub: string;
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
const rawSecret = process.env['INTERNAL_JWT_SECRET'] ?? DEFAULT_DEV_SECRET;
const INTERNAL_SECRET = new TextEncoder().encode(rawSecret);
const INTERNAL_ISSUER =
  process.env['INTERNAL_JWT_ISSUER'] ?? 'celebbase-user-service';

const log = createLogger('bff-session');

// BFF verifies internal HS256 JWTs issued by user-service.
// Cognito id_tokens never reach the BFF directly — user-service exchanges them
// for internal tokens before issuing the cb_access cookie.
// Phase C will upgrade to RS256 when user-service exposes a JWKS endpoint.
export async function verifyAccessToken(token: string): Promise<Session> {
  const { payload } = await jwtVerify(token, INTERNAL_SECRET, {
    issuer: INTERNAL_ISSUER,
    algorithms: ['HS256'],
    clockTolerance: 60,
  });
  return {
    user_id: String(payload.sub ?? ''),
    email: typeof payload['email'] === 'string' ? payload['email'] : '',
    cognito_sub:
      typeof payload['cognito_sub'] === 'string' ? payload['cognito_sub'] : '',
  };
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
      return withRequestId(toBffErrorResponse(err, requestId), requestId);
    }
  };
}

export type { BffError };
