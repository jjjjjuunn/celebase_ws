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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals, static assets, and API routes
    '/((?!_next/static|_next/image|favicon\\.ico|api/|slice/).*)',
  ],
};
