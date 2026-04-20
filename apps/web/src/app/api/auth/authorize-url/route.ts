import { type NextRequest } from 'next/server';
import { createPublicRoute, readEnv } from '../../_lib/session.js';

const COGNITO_HOSTED_UI_DOMAIN = readEnv('COGNITO_HOSTED_UI_DOMAIN');
const COGNITO_CLIENT_ID = readEnv('COGNITO_CLIENT_ID');
const COGNITO_REDIRECT_URI = readEnv('COGNITO_REDIRECT_URI');

// 48 bytes → 64-char base64url code_verifier (PKCE spec: 43–128 chars)
function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(hash);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export const GET = createPublicRoute(async (req: NextRequest) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
  const returnToRaw = req.nextUrl.searchParams.get('return_to');
  // Only allow relative paths to prevent open-redirect
  const returnTo =
    typeof returnToRaw === 'string' && returnToRaw.startsWith('/')
      ? returnToRaw
      : '/dashboard';

  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authorizeUrl = new URL(
    `https://${COGNITO_HOSTED_UI_DOMAIN}/oauth2/authorize`,
  );
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', COGNITO_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', COGNITO_REDIRECT_URI);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('scope', 'openid email profile');

  const secure = process.env['NODE_ENV'] === 'production' ? '; Secure' : '';
  const cookiePath = 'Path=/api/auth/callback; Max-Age=300';
  const cookieFlags = `HttpOnly; SameSite=Lax; ${cookiePath}${secure}`;

  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  });
  headers.append('Set-Cookie', `cb_oauth_state=${state}; ${cookieFlags}`);
  headers.append(
    'Set-Cookie',
    `cb_oauth_verifier=${codeVerifier}; ${cookieFlags}`,
  );
  headers.append(
    'Set-Cookie',
    `cb_return_to=${encodeURIComponent(returnTo)}; ${cookieFlags}`,
  );

  return new Response(
    JSON.stringify({ authorize_url: authorizeUrl.toString() }),
    { status: 200, headers },
  );
});
