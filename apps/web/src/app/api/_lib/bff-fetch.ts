import type { ZodType } from 'zod';
import { redirect } from 'next/navigation';
import {
  createLogger,
  SessionExpiredError,
  type BffError,
} from './bff-error.js';
import { readEnv } from './session.js';

export { SessionExpiredError } from './bff-error.js';

export type BffTarget = 'user' | 'content' | 'meal-plan' | 'analytics';

// D29: Use this helper ONLY in Server Components after awaiting fetchBff.
// RSCs MUST pattern-match the error specifically — NEVER a bare `catch`
// that could swallow Next.js's internal NEXT_REDIRECT throw.
//
//   try { await fetchBff(...) } catch (err) {
//     if (err instanceof SessionExpiredError) redirectOnSessionExpired(err);
//     throw err;
//   }
//
// API route handlers wrapped in createProtectedRoute must NOT call this;
// createProtectedRoute catches SessionExpiredError and returns 401 JSON.
// redirect() inside an API route throws NEXT_REDIRECT which Next.js converts
// to a 307 with Location — wrong for JSON APIs.
export function redirectOnSessionExpired(err: unknown): never {
  if (err instanceof SessionExpiredError) {
    const returnTo = err.returnTo ?? '/dashboard';
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  throw err;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: BffError };

export interface BffFetchOptions<T> extends Omit<RequestInit, 'signal'> {
  schema: ZodType<T>;
  requestId: string;
  userId?: string;
  authToken?: string;
  timeoutMs?: number;
  forwardedFor?: string;
}

const USER_SERVICE_URL = readEnv('USER_SERVICE_URL');
const CONTENT_SERVICE_URL = readEnv('CONTENT_SERVICE_URL');
const MEAL_PLAN_URL = readEnv('MEAL_PLAN_URL');
const ANALYTICS_SERVICE_URL = readEnv('ANALYTICS_SERVICE_URL');
const log = createLogger('bff-fetch');

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const rateLimitBuckets = new Map<string, Bucket>();

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
const RATE_PUBLIC_PER_MIN = 60;
const RATE_AUTH_PER_MIN = 20;

function baseUrlFor(target: BffTarget): string {
  switch (target) {
    case 'user':
      return USER_SERVICE_URL;
    case 'content':
      return CONTENT_SERVICE_URL;
    case 'meal-plan':
      return MEAL_PLAN_URL;
    case 'analytics':
      return ANALYTICS_SERVICE_URL;
  }
}

function checkRateLimit(
  key: string,
  capacity: number,
  requestId: string,
): BffError | null {
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);
  const bucket: Bucket =
    existing ?? { tokens: capacity, lastRefill: now };
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    capacity,
    bucket.tokens + elapsedSec * (capacity / 60),
  );
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    rateLimitBuckets.set(key, bucket);
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      requestId,
      retryable: true,
      retry_after: 60,
    };
  }
  bucket.tokens -= 1;
  rateLimitBuckets.set(key, bucket);
  return null;
}

function mergeHeaders(
  init: HeadersInit | undefined,
  extra: Record<string, string>,
): Headers {
  const headers = new Headers(init);
  for (const [k, v] of Object.entries(extra)) {
    headers.set(k, v);
  }
  return headers;
}

function pickUpstreamError(body: unknown): {
  code: string;
  message: string;
  retryable?: boolean;
  retry_after?: number;
} {
  const fallback = { code: 'UPSTREAM_ERROR', message: 'Upstream error' };
  if (typeof body !== 'object' || body === null) return fallback;
  const outer = body as Record<string, unknown>;
  const errField = outer['error'];
  if (typeof errField !== 'object' || errField === null) return fallback;
  const inner = errField as Record<string, unknown>;
  const result: {
    code: string;
    message: string;
    retryable?: boolean;
    retry_after?: number;
  } = {
    code: typeof inner['code'] === 'string' ? inner['code'] : fallback.code,
    message:
      typeof inner['message'] === 'string'
        ? inner['message']
        : fallback.message,
  };
  if (typeof inner['retryable'] === 'boolean') {
    result.retryable = inner['retryable'];
  }
  if (typeof inner['retry_after'] === 'number') {
    result.retry_after = inner['retry_after'];
  }
  return result;
}

export async function fetchBff<T>(
  target: BffTarget,
  path: string,
  opts: BffFetchOptions<T>,
): Promise<Result<T>> {
  const { schema, requestId, userId, authToken, timeoutMs, forwardedFor, ...rest } = opts;
  const rateKey = userId ?? forwardedFor ?? 'anon';
  const capacity = path.startsWith('/auth/')
    ? RATE_AUTH_PER_MIN
    : RATE_PUBLIC_PER_MIN;
  const rateErr = checkRateLimit(rateKey, capacity, requestId);
  if (rateErr !== null) {
    return { ok: false, error: rateErr };
  }

  const url = `${baseUrlFor(target)}${path}`;
  const hasBody = rest.body !== undefined && rest.body !== null;
  const extraHeaders: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': requestId,
  };
  if (hasBody) extraHeaders['Content-Type'] = 'application/json';
  if (forwardedFor !== undefined && forwardedFor !== '') {
    extraHeaders['X-Forwarded-For'] = forwardedFor;
  }
  if (authToken !== undefined && authToken !== '') {
    extraHeaders['Authorization'] = `Bearer ${authToken}`;
  }
  const headers = mergeHeaders(rest.headers, extraHeaders);

  const signal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const response = await fetch(url, { ...rest, headers, signal }).catch(
    (err: unknown) => {
      if (err instanceof Error && err.name === 'TimeoutError') {
        return { __bffError: 'timeout' as const };
      }
      log.warn({ err, target, path }, 'Upstream fetch failed');
      return { __bffError: 'network' as const };
    },
  );

  if ('__bffError' in response) {
    if (response.__bffError === 'timeout') {
      return {
        ok: false,
        error: {
          status: 504,
          code: 'UPSTREAM_TIMEOUT',
          message: 'Upstream service timeout',
          requestId,
          retryable: true,
        },
      };
    }
    return {
      ok: false,
      error: {
        status: 502,
        code: 'UPSTREAM_UNREACHABLE',
        message: 'Upstream service unreachable',
        requestId,
        retryable: true,
      },
    };
  }

  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    Number.parseInt(contentLength, 10) > MAX_RESPONSE_BYTES
  ) {
    return {
      ok: false,
      error: {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Upstream response exceeds 1 MB',
        requestId,
      },
    };
  }

  const rawText = await response.text().catch(() => '');
  if (
    typeof rawText === 'string' &&
    Buffer.byteLength(rawText, 'utf-8') > MAX_RESPONSE_BYTES
  ) {
    return {
      ok: false,
      error: {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Upstream response exceeds 1 MB',
        requestId,
      },
    };
  }

  let parsedBody: unknown = {};
  if (rawText.length > 0) {
    try {
      parsedBody = JSON.parse(rawText) as unknown;
    } catch {
      parsedBody = {};
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new SessionExpiredError();
    }
    const picked = pickUpstreamError(parsedBody);
    return {
      ok: false,
      error: {
        status: response.status,
        code: picked.code,
        message: picked.message,
        requestId,
        ...(picked.retryable !== undefined
          ? { retryable: picked.retryable }
          : {}),
        ...(picked.retry_after !== undefined
          ? { retry_after: picked.retry_after }
          : {}),
      },
    };
  }

  const parsed = schema.safeParse(parsedBody);
  if (!parsed.success) {
    log.error(
      { zodIssues: parsed.error.issues, path, target },
      'BFF schema validation failed',
    );
    return {
      ok: false,
      error: {
        status: 502,
        code: 'BFF_CONTRACT_VIOLATION',
        message: 'Upstream response failed schema validation',
        requestId,
      },
    };
  }

  return { ok: true, data: parsed.data };
}
