import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff } from '../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';

function sessionCookies(accessToken: string, refreshToken: string): string[] {
  const secure = process.env['NODE_ENV'] === 'production' ? '; Secure' : '';
  return [
    `cb_access=${accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${secure}`,
    `cb_refresh=${refreshToken}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=2592000${secure}`,
  ];
}

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
    forwardedFor,
  });
  if (!result.ok) {
    return toBffErrorResponse(result.error, requestId);
  }
  const { access_token, refresh_token, user } = result.data;
  const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of sessionCookies(access_token, refresh_token)) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(JSON.stringify({ user }), { status: 201, headers: responseHeaders });
});
