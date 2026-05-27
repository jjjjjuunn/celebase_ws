// IMPL-ACCOUNT-RESTORE-001 — BFF mobile account-restore route. Companion of
// ./login + ./signup: public (no internal JWT — the verified id_token is the
// auth), JSON-body-only, NO Set-Cookie (mobile uses expo-secure-store). Forwards
// a verified Cognito/social id_token to user-service POST /auth/restore, which
// clears a within-grace soft-delete and returns { user, tokens }.

import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../../_lib/session.js';
import { toBffErrorResponse, zodErrorResponse } from '../../../_lib/bff-error.js';

export const POST = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = schemas.RestoreRequestSchema.safeParse(body);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error, requestId);
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/auth/restore', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
    schema: schemas.RestoreResponseSchema,
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
