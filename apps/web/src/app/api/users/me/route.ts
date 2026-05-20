import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../_lib/session.js';
import { toBffErrorResponse, zodErrorResponse } from '../../_lib/bff-error.js';

// user-service GET /users/me returns the User object directly (no envelope).
// The BFF wraps it in { user: ... } to match MeResponseSchema for the frontend.
export const GET = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me', {
    method: 'GET',
    schema: schemas.UserWireSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify({ user: result.data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});

// Account deletion (Apple App Store 5.1.1(v) requires an in-app initiation path).
// user-service DELETE /users/me soft-deletes (deleted_at) → blocks login; the
// downstream PHI-purge batch is a separate backend concern (security.md). Returns
// 204 with no body, mirroring the upstream. The mobile client clears tokens +
// logs out on 204.
export const DELETE = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me', {
    method: 'DELETE',
    schema: z.unknown(),
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(null, {
    status: 204,
    headers: { 'X-Request-Id': requestId },
  });
});

export const PATCH = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = schemas.UpdateMeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error, requestId);
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me', {
    method: 'PATCH',
    body: JSON.stringify(parsed.data),
    schema: schemas.UserWireSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify({ user: result.data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});
