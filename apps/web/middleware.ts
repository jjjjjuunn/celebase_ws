import { NextResponse, type NextRequest } from 'next/server';

// /onboarding is added in 002-2b when the page lands. Adding it here before
// the page exists would cause a redirect loop (authed user → /onboarding → 404).
const PROTECTED_PATHS = ['/dashboard', '/plans', '/account'] as const;
const SESSION_COOKIE = 'cb_access';
const REQUEST_ID_HEADER = 'x-request-id';

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// D28: baseline CSP. Env-interpolated wss:// + form-action close the two
// widest vectors (bare wss: wildcard + arbitrary form POST targets). Nonce-
// based script-src / style-src is deferred to Sprint C; until then
// 'unsafe-inline' is required for Next.js hydration scripts and inline styles.
function buildCsp(): string {
  const isProd = process.env['NODE_ENV'] === 'production';
  const wsHost = process.env['NEXT_PUBLIC_WS_HOST'] ?? 'localhost:3003';
  const cognitoDomain =
    process.env['COGNITO_HOSTED_UI_DOMAIN'] ?? 'auth.example.com';
  const connectSrc = isProd
    ? `'self' wss://${wsHost}`
    : `'self' wss: ws:`;
  const formAction = isProd
    ? `'self' https://${cognitoDomain}`
    : `'self' http: https:`;
  return [
    `default-src 'self'`,
    `img-src 'self' data: https:`,
    `connect-src ${connectSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self' 'unsafe-inline'`,
    `form-action ${formAction}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
  ].join('; ');
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  if (isProtected(pathname) && !req.cookies.get(SESSION_COOKIE)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?from=${encodeURIComponent(pathname + search)}`;
    const redirectRes = NextResponse.redirect(loginUrl);
    redirectRes.headers.set('Content-Security-Policy', buildCsp());
    return redirectRes;
  }

  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? generateRequestId();
  const response = NextResponse.next({
    request: { headers: new Headers({ ...Object.fromEntries(req.headers), [REQUEST_ID_HEADER]: requestId }) },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set('Content-Security-Policy', buildCsp());
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|slice).*)'],
};
