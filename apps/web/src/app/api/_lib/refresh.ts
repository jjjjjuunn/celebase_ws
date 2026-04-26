// Silent refresh helper for createProtectedRoute. Called only when the
// incoming access token is expired (jose throws JWTExpired). One-shot:
// createProtectedRoute never retries this helper — if refresh fails the
// wrapper returns 401 with cleared cookies.
//
// Contract notes:
//  - Timeout: 2s (access token lifetime is 15m so a fast failure > retry).
//  - No rate limit: protected by the cb_refresh cookie itself (one cookie,
//    one attempt per request cycle).
//  - Logger whitelist: reason / requestId / ok / status only. Token values
//    MUST NOT appear in log payloads (Rule #8).
//  - RefreshResponseSchema comes from @celebbase/shared-types so BFF and
//    user-service stay in lockstep.
//
// Returns a discriminated union — callers can narrow on ok=true without
// null assertions on newAccess/newRefresh.
import { schemas } from '@celebbase/shared-types';
import { readEnv } from './env.js';
import { createLogger } from './bff-error.js';

const USER_SERVICE_URL = readEnv('USER_SERVICE_URL');
const REFRESH_TIMEOUT_MS = 2_000;

// Mirrors the Max-Age constants in auth/refresh/route.ts. If user-service
// ever exposes absolute exp timestamps in the refresh response we'll derive
// from those — for now the access/refresh token lifetimes are fixed.
const ACCESS_MAX_AGE_SEC = 900;
const REFRESH_MAX_AGE_SEC = 2_592_000;

const log = createLogger('bff-session-refresh');

export type SilentRefreshReason =
  | 'no_cookie'
  | 'upstream_4xx'
  | 'upstream_5xx'
  | 'network'
  | 'timeout'
  | 'schema_mismatch';

export type SilentRefreshResult =
  | {
      ok: true;
      newAccess: string;
      newRefresh: string;
      accessExpSec: number;
      refreshExpSec: number;
    }
  | { ok: false; reason: SilentRefreshReason };

export async function attemptSilentRefresh(
  refreshToken: string,
  requestId: string,
): Promise<SilentRefreshResult> {
  if (refreshToken === '') {
    log.info({ reason: 'no_cookie', requestId, ok: false }, 'silent_refresh');
    return { ok: false, reason: 'no_cookie' };
  }

  const url = `${USER_SERVICE_URL}/auth/refresh`;
  const signal = AbortSignal.timeout(REFRESH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal,
    });
  } catch (err) {
    const reason: SilentRefreshReason =
      err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network';
    log.warn({ reason, requestId, ok: false }, 'silent_refresh');
    return { ok: false, reason };
  }

  if (!response.ok) {
    const reason: SilentRefreshReason =
      response.status >= 500 ? 'upstream_5xx' : 'upstream_4xx';
    log.warn(
      { reason, requestId, ok: false, status: response.status },
      'silent_refresh',
    );
    return { ok: false, reason };
  }

  let parsedBody: unknown;
  try {
    parsedBody = (await response.json()) as unknown;
  } catch {
    log.warn(
      { reason: 'schema_mismatch', requestId, ok: false },
      'silent_refresh',
    );
    return { ok: false, reason: 'schema_mismatch' };
  }

  const parsed = schemas.RefreshResponseSchema.safeParse(parsedBody);
  if (!parsed.success) {
    log.warn(
      { reason: 'schema_mismatch', requestId, ok: false },
      'silent_refresh',
    );
    return { ok: false, reason: 'schema_mismatch' };
  }

  log.info({ reason: 'ok', requestId, ok: true }, 'silent_refresh');
  return {
    ok: true,
    newAccess: parsed.data.access_token,
    newRefresh: parsed.data.refresh_token,
    accessExpSec: ACCESS_MAX_AGE_SEC,
    refreshExpSec: REFRESH_MAX_AGE_SEC,
  };
}
