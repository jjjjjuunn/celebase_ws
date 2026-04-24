import { type NextRequest } from 'next/server';
import { schemas } from '@celebbase/shared-types';
import { fetchBff, SessionExpiredError } from '../../_lib/bff-fetch.js';
import { createPublicRoute } from '../../_lib/session.js';
import { toBffErrorResponse } from '../../_lib/bff-error.js';
import {
  clearSessionCookies,
  setSessionCookies,
} from '../../_lib/cookies.js';

// Max-Age mirrors user-service token lifetimes:
//   access  → 15 min (auth.service.ts JWT exp)
//   refresh → 30 days (refresh_tokens table retention)
// If user-service ever changes these, update here in lockstep.
const ACCESS_MAX_AGE_SEC = 900;
const REFRESH_MAX_AGE_SEC = 2_592_000;

function unauthorizedClearCookies(requestId: string): Response {
  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    'X-Token-Expired': 'true',
  });
  for (const cookie of clearSessionCookies()) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(
    JSON.stringify({
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Refresh token expired',
        requestId,
      },
    }),
    { status: 401, headers: responseHeaders },
  );
}

export const POST = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const refreshToken = req.cookies.get('cb_refresh')?.value;
  if (!refreshToken) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing refresh cookie',
          requestId,
        },
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
      },
    );
  }
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;

  // fetchBff throws SessionExpiredError on upstream 401. The public-route
  // wrapper can't refresh (that's exactly what this route is for), so catch
  // it here and return 401 + cleared cookies. Non-401 errors fall through to
  // the normal Result<T>.ok === false branch.
  let result: Awaited<ReturnType<typeof fetchBff<typeof schemas.RefreshResponseSchema._type>>>;
  try {
    result = await fetchBff('user', '/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
      schema: schemas.RefreshResponseSchema,
      requestId,
      ...(forwardedFor !== undefined ? { forwardedFor } : {}),
    });
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      return unauthorizedClearCookies(requestId);
    }
    throw err;
  }
  if (!result.ok) {
    const responseHeaders = new Headers({
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    });
    if (result.error.status === 401 || result.error.status === 403) {
      for (const cookie of clearSessionCookies()) {
        responseHeaders.append('Set-Cookie', cookie);
      }
      return new Response(
        JSON.stringify({
          error: {
            code: result.error.code,
            message: result.error.message,
            requestId,
          },
        }),
        { status: result.error.status, headers: responseHeaders },
      );
    }
    return toBffErrorResponse(result.error, requestId);
  }
  const { access_token, refresh_token } = result.data;
  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  });
  for (const cookie of setSessionCookies({
    accessToken: access_token,
    refreshToken: refresh_token,
    accessMaxAgeSec: ACCESS_MAX_AGE_SEC,
    refreshMaxAgeSec: REFRESH_MAX_AGE_SEC,
  })) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: responseHeaders,
  });
});
