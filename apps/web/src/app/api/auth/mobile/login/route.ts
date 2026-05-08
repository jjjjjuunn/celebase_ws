// IMPL-MOBILE-AUTH-002a — BFF mobile login route (Plan v5 §58, DECISION §9).
// Companion of ./signup/route.ts — same JSON-body-only contract.

import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../../_lib/session.js';
import { toBffErrorResponse } from '../../../_lib/bff-error.js';

export const POST = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = schemas.LoginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/auth/login', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
    schema: schemas.LoginResponseSchema,
    requestId,
    ...(forwardedFor !== undefined ? { forwardedFor } : {}),
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  });
});
