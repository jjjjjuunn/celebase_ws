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

function clearSessionCookies(): string[] {
  return [
    'cb_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    'cb_refresh=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0',
  ];
}

export const POST = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const refreshToken = req.cookies.get('cb_refresh')?.value;
  if (!refreshToken) {
    return new Response(
      JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Missing refresh cookie', requestId } }),
      { status: 401, headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
    );
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  const result = await fetchBff('user', '/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
    schema: schemas.RefreshResponseSchema,
    requestId,
    forwardedFor,
  });
  if (!result.ok) {
    const responseHeaders = new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': requestId });
    if (result.error.status === 401 || result.error.status === 403) {
      for (const cookie of clearSessionCookies()) {
        responseHeaders.append('Set-Cookie', cookie);
      }
      return new Response(
        JSON.stringify({ error: { code: result.error.code, message: result.error.message, requestId } }),
        { status: result.error.status, headers: responseHeaders },
      );
    }
    return toBffErrorResponse(result.error, requestId);
  }
  const { access_token, refresh_token } = result.data;
  const responseHeaders = new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': requestId });
  for (const cookie of sessionCookies(access_token, refresh_token)) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: responseHeaders });
});
