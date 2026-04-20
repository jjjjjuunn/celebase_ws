import { type NextRequest } from 'next/server';
import { readEnv } from '../../_lib/session.js';

// Stripe webhook endpoint — no Cognito JWT auth. Stripe authenticates via the
// Stripe-Signature header; commerce-service verifies the signature using the
// webhook secret. The BFF's sole job is:
//   1. Read raw body as string (signature verification requires the exact bytes)
//   2. Forward Stripe-Signature + raw body to commerce-service
//   3. Return commerce-service's response
//
// SSRF note: target is resolved from COMMERCE_SERVICE_URL env var (internal allowlist).
// No user-controlled URL is used here.

const COMMERCE_SERVICE_URL = readEnv('COMMERCE_SERVICE_URL');
const WEBHOOK_TIMEOUT_MS = 10_000;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const stripeSig = req.headers.get('stripe-signature');

  if (stripeSig === null || stripeSig === '') {
    return new Response(
      JSON.stringify({ error: { code: 'MISSING_SIGNATURE', message: 'Stripe-Signature header required', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }

  const rawBody = await req.text().catch(() => null);
  if (rawBody === null) {
    return new Response(
      JSON.stringify({ error: { code: 'BODY_READ_ERROR', message: 'Failed to read request body', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }

  const signal = AbortSignal.timeout(WEBHOOK_TIMEOUT_MS);
  const response = await fetch(`${COMMERCE_SERVICE_URL}/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripeSig,
      'X-Request-Id': requestId,
    },
    body: rawBody,
    signal,
  }).catch((err: unknown) => {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return { __err: isTimeout ? ('timeout' as const) : ('network' as const) };
  });

  if ('__err' in response) {
    const status = response.__err === 'timeout' ? 504 : 502;
    const code = response.__err === 'timeout' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE';
    return new Response(
      JSON.stringify({ error: { code, message: 'Commerce service unavailable', requestId } }),
      { status, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }

  const body = await response.text().catch(() => '');
  return new Response(body || null, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      'X-Request-Id': requestId,
    },
  });
}
