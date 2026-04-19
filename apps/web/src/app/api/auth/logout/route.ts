import { type NextRequest } from 'next/server';
import { createLogger } from '../../_lib/bff-error.js';
import { createPublicRoute, readEnv } from '../../_lib/session.js';

const USER_SERVICE_URL = readEnv('USER_SERVICE_URL');
const LOGOUT_FORWARD_TIMEOUT_MS = 2_000;

const log = createLogger('bff-logout');

function clearSessionCookies(): string[] {
  return [
    'cb_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    'cb_refresh=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0',
  ];
}

// Best-effort forward to user-service so the audit log records an
// `auth.logout` event while the cookie is still valid. On any failure
// (network, 401 expired token, upstream 5xx) we swallow the error and
// proceed with local cookie clearing — logout must never fail the UX.
async function forwardLogout(
  accessToken: string,
  requestId: string,
): Promise<void> {
  try {
    await fetch(`${USER_SERVICE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Request-Id': requestId,
      },
      signal: AbortSignal.timeout(LOGOUT_FORWARD_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    log.warn({ err }, 'logout forward failed (best-effort)');
  }
}

export const POST = createPublicRoute(async (req: NextRequest) => {
  const accessToken = req.cookies.get('cb_access')?.value;
  const requestId = req.headers.get('x-request-id') ?? '';
  if (accessToken !== undefined && accessToken !== '') {
    await forwardLogout(accessToken, requestId);
  }

  const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of clearSessionCookies()) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 204, headers: responseHeaders });
});
