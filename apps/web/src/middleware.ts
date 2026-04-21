import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require a valid session cookie
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/celebrities',
  '/plans',
  '/recipes',
  '/onboarding',
  '/track',
  '/account',
];

// Routes that redirect authenticated users away (already logged in)
const AUTH_PATHS = ['/login', '/signup'];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  // unsafe-eval is required by Next.js webpack HMR in development.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}'`;
  const wsUrl = process.env['NEXT_PUBLIC_WS_URL'] ?? '';
  const connectSrc = wsUrl !== '' ? `connect-src 'self' ${wsUrl}` : "connect-src 'self'";
  const directives: string[] = [
    "default-src 'self'",
    scriptSrc,
    // CSS Modules inject styles dynamically in Next.js — unsafe-inline is required.
    // Tracked in IMPL-DS-* for Trusted Types enforcement once we move off CSS Modules.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    connectSrc,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  return directives.join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('cb_access');

  if (PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  if (AUTH_PATHS.includes(pathname) && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Generate a per-request nonce for CSP script-src.
  // Forwarded via x-nonce request header so RSCs can read it via headers().
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals, static assets, and API routes
    '/((?!_next/static|_next/image|favicon\\.ico|api/|slice/).*)',
  ],
};
