// IMPL-MOBILE-SUB-SYNC-002 — BFF wrapper around commerce-service
// /internal/subscriptions/refresh-from-revenuecat.
//
// mobile flow (Plan v5 §M5): RevenueCat purchasePackage → IAP success →
// mobile calls THIS route → BFF mints internal JWT (audience =
// commerce-service:internal) → commerce reads RevenueCat REST → upserts
// subscriptions + syncs user-service tier → tier returned to mobile →
// Inspired plan unblocked.
//
// T4 (SUB-SYNC-001b adversarial): BFF MUST use session.user_id (authenticated
// session) for the user_id field — body's user_id is ignored. This prevents
// any client (web or mobile) from triggering tier sync for an arbitrary user.

import { z } from 'zod';
import { NextRequest } from 'next/server';
import { createProtectedRoute, type Session } from '../../_lib/session.js';
import { baseUrlFor } from '../../_lib/bff-fetch.js';
import { callInternal, internalErrorToResponse } from '../../_lib/internal-client.js';

// Body shape: source only. user_id intentionally NOT accepted from client —
// derived from authenticated session (T4 enforce).
const RequestSchema = z
  .object({
    source: z.enum(['purchase', 'app_open', 'manual']),
  })
  .strict();

const ResponseSchema = z
  .object({
    user_id: z.string().uuid(),
    tier: z.enum(['free', 'premium', 'elite']),
    status: z.enum(['active', 'past_due', 'cancelled', 'expired', 'free']),
    current_period_end: z.string().nullable(),
    source: z.enum(['purchase', 'app_open', 'manual']),
  })
  .strict();

async function handle(req: NextRequest, session: Session): Promise<Response> {
  // createProtectedRoute already guarantees req carries a request ID via its
  // ensureRequestId wrapping. Mirror the convention used by other protected
  // routes (apps/web/src/app/api/users/me/route.ts:10).
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return internalErrorToResponse({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid JSON body',
      requestId,
    });
  }

  const parsed = RequestSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return internalErrorToResponse({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? 'Invalid request body',
      requestId,
    });
  }

  // T4 enforce: user_id is from session, not from client body.
  const result = await callInternal({
    audience: 'commerce-service:internal',
    baseUrl: baseUrlFor('commerce'),
    path: '/internal/subscriptions/refresh-from-revenuecat',
    body: { user_id: session.user_id, source: parsed.data.source },
    schema: ResponseSchema,
    requestId,
  });

  if (!result.ok) {
    return internalErrorToResponse(result.error);
  }

  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
}

export const POST = createProtectedRoute(handle);
