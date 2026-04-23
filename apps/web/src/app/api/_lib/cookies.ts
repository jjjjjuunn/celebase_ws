// Shared Set-Cookie helpers for the BFF auth layer.
// Consolidated from auth/refresh/route.ts + auth/logout/route.ts to a single
// source of truth. Used by silent refresh in session.ts and the refresh/logout
// routes themselves.
//
// Cookie layout (matches existing user-service contract):
//   cb_access  → Path=/          ; 15m lifetime, issued on login/refresh
//   cb_refresh → Path=/api/auth  ; 30d lifetime, scoped to auth routes only
// Secure flag is production-only (staging/dev set NODE_ENV≠production so the
// browser accepts cookies on http://localhost). SameSite=Lax is required for
// Cognito OAuth callback redirects to carry the cookie.

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  // Seconds remaining until each token expires. Derived by the caller from
  // (accessExp - now) / (refreshExp - now). Callers that only have absolute
  // expiry timestamps must convert before passing here.
  accessMaxAgeSec: number;
  refreshMaxAgeSec: number;
}

function secureSuffix(): string {
  return process.env['NODE_ENV'] === 'production' ? '; Secure' : '';
}

export function setSessionCookies(tokens: SessionTokens): string[] {
  const secure = secureSuffix();
  const accessMaxAge = Math.max(0, Math.floor(tokens.accessMaxAgeSec));
  const refreshMaxAge = Math.max(0, Math.floor(tokens.refreshMaxAgeSec));
  return [
    `cb_access=${tokens.accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${String(accessMaxAge)}${secure}`,
    `cb_refresh=${tokens.refreshToken}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${String(refreshMaxAge)}${secure}`,
  ];
}

export function clearSessionCookies(): string[] {
  const secure = secureSuffix();
  return [
    `cb_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
    `cb_refresh=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0${secure}`,
  ];
}
