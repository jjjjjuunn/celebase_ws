import { NextResponse, type NextRequest } from 'next/server';

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

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  if (isProtected(pathname) && !req.cookies.get(SESSION_COOKIE)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?from=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  const requestId = req.headers.get(REQUEST_ID_HEADER) ?? generateRequestId();
  const response = NextResponse.next({
    request: { headers: new Headers({ ...Object.fromEntries(req.headers), [REQUEST_ID_HEADER]: requestId }) },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|slice).*)'],
};
