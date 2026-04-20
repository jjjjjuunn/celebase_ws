import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../_lib/session.js';
import { toBffErrorResponse } from '../_lib/bff-error.js';

export const GET = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const search = req.nextUrl.search;
  const result = await fetchBff('user', `/daily-logs${search}`, {
    method: 'GET',
    schema: schemas.DailyLogListResponseSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});

export const POST = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = schemas.CreateDailyLogRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/daily-logs', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
    schema: schemas.DailyLogResponseSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
    authToken: session.raw_token,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});
