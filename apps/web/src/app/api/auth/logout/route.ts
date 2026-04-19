import 'server-only';
import { type NextRequest } from 'next/server';
import { createPublicRoute } from '../../_lib/session.js';

function clearSessionCookies(): string[] {
  return [
    'cb_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    'cb_refresh=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0',
  ];
}

export const POST = createPublicRoute(async (_req: NextRequest) => {
  const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of clearSessionCookies()) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 204, headers: responseHeaders });
});
