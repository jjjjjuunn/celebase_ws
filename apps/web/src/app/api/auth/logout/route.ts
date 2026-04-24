import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createLogger } from '../../_lib/bff-error.js';
import { createPublicRoute } from '../../_lib/session.js';
import { clearSessionCookies } from '../../_lib/cookies.js';
import { fetchBff, SessionExpiredError } from '../../_lib/bff-fetch.js';

const LOGOUT_FORWARD_TIMEOUT_MS = 2_000;

const log = createLogger('bff-logout');

// Best-effort forward to user-service so the audit log records an
// `auth.logout` event while the cookie is still valid. On any failure
// (network, 401 expired token, upstream 5xx, missing refresh cookie) we
// swallow the error and proceed with local cookie clearing — logout must
// never fail the UX.
async function forwardLogout(
  accessToken: string,
  refreshToken: string,
  requestId: string,
  forwardedFor: string | undefined,
): Promise<void> {
  try {
    const result = await fetchBff('user', '/auth/logout', {
      schema: z.unknown(),
      requestId,
      authToken: accessToken,
      ...(forwardedFor !== undefined ? { forwardedFor } : {}),
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
      timeoutMs: LOGOUT_FORWARD_TIMEOUT_MS,
    });
    if (!result.ok) {
      log.warn(
        { status: result.error.status, code: result.error.code },
        'logout forward non-ok (best-effort)',
      );
    }
  } catch (err: unknown) {
    if (err instanceof SessionExpiredError) {
      // Upstream 401: token already invalid — no-op.
      return;
    }
    log.warn({ err }, 'logout forward failed (best-effort)');
  }
}

export const POST = createPublicRoute(async (req: NextRequest) => {
  const accessToken = req.cookies.get('cb_access')?.value;
  const refreshToken = req.cookies.get('cb_refresh')?.value;
  const requestId = req.headers.get('x-request-id') ?? '';
  const forwardedFor = req.headers.get('x-forwarded-for') ?? undefined;
  if (
    accessToken !== undefined &&
    accessToken !== '' &&
    refreshToken !== undefined &&
    refreshToken !== ''
  ) {
    await forwardLogout(accessToken, refreshToken, requestId, forwardedFor);
  }

  const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of clearSessionCookies()) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 204, headers: responseHeaders });
});
