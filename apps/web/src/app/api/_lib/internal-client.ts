// BFF -> backend internal endpoint client.
//
// Mints a service-to-service internal JWT (audience matches the target
// service's registerInternalJwtAuth config) and calls the upstream endpoint.
// Distinct from fetchBff which forwards the user's external JWT — this helper
// is for /internal/* paths that require the BFF to act as a privileged caller.
//
// Used by IMPL-MOBILE-SUB-SYNC-002 BFF /api/subscriptions/sync route which
// proxies to commerce-service /internal/subscriptions/refresh-from-revenuecat
// (audience = commerce-service:internal).

import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLogger } from './bff-error.js';
import { readEnv } from './env.js';

const log = createLogger('bff-internal-client');

const DEFAULT_DEV_SECRET = 'dev-secret-not-for-prod';
const DEFAULT_TIMEOUT_MS = 8_000;
const INTERNAL_ISSUER = 'celebbase-internal';

interface InternalCallOpts<T> {
  audience: string;
  baseUrl: string;
  path: string;
  body: unknown;
  schema: z.ZodSchema<T>;
  requestId: string;
  timeoutMs?: number;
}

interface InternalCallError {
  status: number;
  code: string;
  message: string;
  requestId: string;
}

export type InternalCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: InternalCallError };

function getInternalSecret(): string {
  const isProd = process.env['NODE_ENV'] === 'production';
  if (isProd) return readEnv('INTERNAL_JWT_SECRET');
  return process.env['INTERNAL_JWT_SECRET'] ?? DEFAULT_DEV_SECRET;
}

async function mintInternalToken(audience: string): Promise<string> {
  const secret = new TextEncoder().encode(getInternalSecret());
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 60)
    .setIssuer(INTERNAL_ISSUER)
    .setAudience(audience)
    .setJti(randomUUID())
    .sign(secret);
}

function buildEnvelope(error: InternalCallError): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        requestId: error.requestId,
      },
    }),
    {
      status: error.status,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': error.requestId },
    },
  );
}

export async function callInternal<T>(
  opts: InternalCallOpts<T>,
): Promise<InternalCallResult<T>> {
  const { audience, baseUrl, path, body, schema, requestId, timeoutMs } = opts;

  let token: string;
  try {
    token = await mintInternalToken(audience);
  } catch (err) {
    log.warn({ err, audience }, 'internal-client.mint-failed');
    return {
      ok: false,
      error: {
        status: 500,
        code: 'INTERNAL_TOKEN_MINT_FAILED',
        message: 'Failed to mint internal token',
        requestId,
      },
    };
  }

  const url = `${baseUrl}${path}`;
  const signal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return {
        ok: false,
        error: {
          status: 504,
          code: 'UPSTREAM_TIMEOUT',
          message: 'Upstream service timeout',
          requestId,
        },
      };
    }
    log.warn({ err, audience, path }, 'internal-client.fetch-failed');
    return {
      ok: false,
      error: {
        status: 502,
        code: 'UPSTREAM_UNREACHABLE',
        message: 'Upstream service unreachable',
        requestId,
      },
    };
  }

  const rawText = await response.text().catch(() => '');
  let parsed: unknown = {};
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const inner = (parsed as { error?: { code?: string; message?: string } }).error ?? {};
    return {
      ok: false,
      error: {
        status: response.status,
        code: typeof inner.code === 'string' ? inner.code : 'UPSTREAM_ERROR',
        message: typeof inner.message === 'string' ? inner.message : 'Upstream error',
        requestId,
      },
    };
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    log.warn({ audience, path, issues: validated.error.issues }, 'internal-client.schema-mismatch');
    return {
      ok: false,
      error: {
        status: 502,
        code: 'UPSTREAM_SCHEMA_MISMATCH',
        message: 'Upstream response did not match expected schema',
        requestId,
      },
    };
  }

  return { ok: true, data: validated.data };
}

export function internalErrorToResponse(error: InternalCallError): Response {
  return buildEnvelope(error);
}
