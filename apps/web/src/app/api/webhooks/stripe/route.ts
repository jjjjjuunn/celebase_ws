import { type NextRequest } from 'next/server';
import { createPublicRoute } from '../../_lib/session.js';
import { forwardRaw } from '../../_lib/forward-raw.js';

// Stripe webhook endpoint — no Cognito JWT auth. Stripe authenticates via the
// Stripe-Signature header; the user-service verifies the signature using the
// webhook secret. The BFF's sole job is:
//   1. Read raw body as string (signature verification requires the exact bytes)
//   2. Forward Stripe-Signature + raw body to user-service
//   3. Return user-service's response with upstream status preserved
//
// SSRF note: target is resolved from USER_SERVICE_URL env var (internal allowlist).
// `path` below is a static string constant — not user-controlled.

const WEBHOOK_TIMEOUT_MS = 10_000;

export const POST = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const stripeSig = req.headers.get('stripe-signature');

  if (stripeSig === null || stripeSig === '') {
    return new Response(
      JSON.stringify({
        error: {
          code: 'MISSING_SIGNATURE',
          message: 'Stripe-Signature header required',
          requestId,
        },
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
      },
    );
  }

  const rawBody = await req.text().catch(() => null);
  if (rawBody === null) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'BODY_READ_ERROR',
          message: 'Failed to read request body',
          requestId,
        },
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
      },
    );
  }

  const result = await forwardRaw({
    target: 'user',
    path: '/webhooks/stripe',
    method: 'POST',
    rawBody,
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripeSig,
    },
    requestId,
    timeoutMs: WEBHOOK_TIMEOUT_MS,
  });

  return new Response(result.body.length > 0 ? result.body : null, {
    status: result.status,
    headers: {
      'Content-Type': result.contentType,
      'X-Request-Id': requestId,
    },
  });
});
