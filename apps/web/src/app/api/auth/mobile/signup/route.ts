// IMPL-MOBILE-AUTH-002a — BFF mobile signup route (Plan v5 §58, DECISION §9).
//
// Mirrors apps/web/src/app/api/auth/signup/route.ts but for mobile clients:
//   - Set-Cookie 절대 미발급 (mobile 은 cookie jar 미사용; web jar pollution 방지)
//   - 응답 body 가 { user, access_token, refresh_token } 직반환 (cookie 대신 JSON)
//
// /auth/refresh 는 BFF 가 cookie-shaped 라 mobile 이 user-service 직접 호출
// (multi-session.md §6 + spec.md §9.3 명시 예외) — 본 라우트와 무관.

import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../../_lib/session.js';
import { toBffErrorResponse } from '../../../_lib/bff-error.js';

export const POST = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = schemas.SignupRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', requestId } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/auth/signup', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
    schema: schemas.SignupResponseSchema,
    requestId,
    ...(forwardedFor !== undefined ? { forwardedFor } : {}),
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  // Return tokens in JSON body — no Set-Cookie. Mobile stores internal refresh
  // JWT in expo-secure-store; access JWT in memory.
  return new Response(JSON.stringify(result.data), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  });
});
