// Per-route rate-limit helper for BFF route handlers.
//
// Distinct from bff-fetch.ts checkRateLimit which limits upstream fetches —
// this one limits inbound BFF route hits (gate before any handler logic).
// Token bucket pattern, in-memory Map keyed by caller-supplied identifier.
//
// First user: IMPL-MOBILE-SUB-SYNC-002 + CHORE-SUB-SYNC-RATE-LIMIT-001
// (`/api/subscriptions/sync` → 5/min per session.user_id, abuse mitigation per
// adversarial T8 from SUB-SYNC-002).
//
// Pattern classification (per spec.md §9.3 + audit-report from
// CHORE-AUTH-PUBLIC-PATHS-AUDIT): this helper is "auth-first" (Pattern B) —
// caller provides authenticated user_id as the key, so invalid sessions never
// reach this gate (createProtectedRoute returns 401 before handler runs).

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const routeBuckets = new Map<string, Bucket>();

// Test-only helper. Module-level Map persists across Jest tests within the
// same process; integration tests must reset in beforeEach.
export function resetRouteRateLimitForTest(): void {
  routeBuckets.clear();
}

export interface RouteRateLimitError {
  status: 429;
  code: 'RATE_LIMITED';
  message: string;
  requestId: string;
  retryable: true;
  retry_after: number;
}

/**
 * Token bucket: capacity tokens refill at `capacity/60` tokens per second.
 * Returns null if request is allowed (token consumed); returns error envelope
 * if bucket is empty.
 *
 * Caller is responsible for providing a key that's distinct from other
 * routes' keys (recommended prefix: `${routeName}:${userId}`).
 */
export function checkRouteRateLimit(
  key: string,
  capacity: number,
  requestId: string,
): RouteRateLimitError | null {
  const now = Date.now();
  const existing = routeBuckets.get(key);
  const bucket: Bucket = existing ?? { tokens: capacity, lastRefill: now };
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * (capacity / 60));
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    routeBuckets.set(key, bucket);
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
  routeBuckets.set(key, bucket);
  return null;
}

export function rateLimitErrorToResponse(error: RouteRateLimitError): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        requestId: error.requestId,
        retryable: error.retryable,
        retry_after: error.retry_after,
      },
    }),
    {
      status: error.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': error.requestId,
        'Retry-After': String(error.retry_after),
      },
    },
  );
}
