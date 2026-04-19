import 'server-only';
import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../_lib/bff-fetch.js';
import { createProtectedRoute, type Session } from '../../../_lib/session.js';
import { toBffErrorResponse } from '../../../_lib/error.js';

export const GET = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me/bio-profile', {
    method: 'GET',
    schema: schemas.BioProfileResponseSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
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
  const parsed = schemas.CreateBioProfileRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me/bio-profile', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
    schema: schemas.BioProfileResponseSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});

export const PATCH = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = schemas.UpdateBioProfileRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me/bio-profile', {
    method: 'PATCH',
    body: JSON.stringify(parsed.data),
    schema: schemas.BioProfileResponseSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});

export const DELETE = createProtectedRoute(async (req: NextRequest, session: Session) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/users/me/bio-profile', {
    method: 'DELETE',
    schema: schemas.DeleteBioProfileResponseSchema,
    requestId,
    forwardedFor,
    userId: session.user_id,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});
