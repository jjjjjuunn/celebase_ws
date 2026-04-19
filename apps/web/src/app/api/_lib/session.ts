import 'server-only';
import type { NextRequest } from 'next/server';
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import {
  createLogger,
  toBffErrorResponse,
  type BffError,
} from './error.js';

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

const JWKS_URI = readEnv('JWKS_URI');
const JWT_ISSUER = readEnv('JWT_ISSUER');
const JWT_AUDIENCE = process.env['JWT_AUDIENCE'];
const JWKS = createRemoteJWKSet(new URL(JWKS_URI));
const log = createLogger('bff-session');

export async function verifyAccessToken(token: string): Promise<Session> {
  const verifyOpts: Parameters<typeof jwtVerify>[2] = {
    issuer: JWT_ISSUER,
    ...(JWT_AUDIENCE !== undefined && JWT_AUDIENCE !== ''
      ? { audience: JWT_AUDIENCE }
      : {}),
  };
  const { payload }: { payload: JWTPayload } = await jwtVerify(
    token,
    JWKS,
    verifyOpts,
  );
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub === '') {
    throw new Error('Token missing sub claim');
  }
  const email = typeof payload['email'] === 'string' ? payload['email'] : '';
  return {
    user_id: sub,
    email,
    cognito_sub: sub,
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
