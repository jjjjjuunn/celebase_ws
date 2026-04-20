// Cognito Hosted UI smoke test (Phase A & B)
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminInitiateAuthCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const SmokeEnvSchema = z.object({
  COGNITO_HOSTED_UI_DOMAIN: z.string().min(1),
  COGNITO_CLIENT_ID: z.string().min(1),
  COGNITO_REDIRECT_URI: z.string().url(),
  COGNITO_USER_POOL_ID: z.string().min(1),
  COGNITO_SMOKE_CLIENT_ID: z.string().min(1),
  AWS_REGION: z.string().default('us-west-2'),
  USER_SERVICE_URL: z.string().url().default('http://localhost:3001'),
});

const env = SmokeEnvSchema.parse(process.env);

async function runPhaseA(): Promise<void> {
  const state = randomUUID();
  const authorizeUrl = new URL(`https://${env.COGNITO_HOSTED_UI_DOMAIN}/oauth2/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', env.COGNITO_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', env.COGNITO_REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', 'openid email profile');
  authorizeUrl.searchParams.set('state', state);

  const r = await fetch(authorizeUrl.toString(), { redirect: 'manual' });
  if (r.status !== 302) {
    throw new Error(`Phase A FAIL: expected 302 from /oauth2/authorize, got ${r.status}`);
  }
  const location = r.headers.get('location') ?? '';
  if (!location.includes('/login') && !location.includes('oauth2')) {
    throw new Error(`Phase A FAIL: unexpected redirect location: ${location.slice(0, 100)}`);
  }
  console.log(JSON.stringify({ phase: 'A', status: 'pass', statusCode: r.status }));
}

async function runPhaseB(): Promise<void> {
  const cognito = new CognitoIdentityProviderClient({ region: env.AWS_REGION });
  const smokeEmail = `smoke-${Date.now()}@celebbase-staging.test`;
  const smokePassword = `Sm0k3!${randomBytes(8).toString('hex')}`;

  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      Username: smokeEmail,
      UserAttributes: [
        { Name: 'email', Value: smokeEmail },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    }));

    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      Username: smokeEmail,
      Password: smokePassword,
      Permanent: true,
    }));

    const authResult = await cognito.send(new AdminInitiateAuthCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      ClientId: env.COGNITO_SMOKE_CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: smokeEmail,
        PASSWORD: smokePassword,
      },
    }));

    const idToken = authResult.AuthenticationResult?.IdToken;
    if (!idToken) throw new Error('Phase B FAIL: no IdToken returned from AdminInitiateAuth');

    const loginRes = await fetch(`${env.USER_SERVICE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: smokeEmail, id_token: idToken }),
    });

    if (loginRes.status !== 200) {
      const body = await loginRes.text();
      throw new Error(`Phase B FAIL: /auth/login returned ${loginRes.status}: ${body.slice(0, 200)}`);
    }

    const tokens = (await loginRes.json()) as { access_token?: string; refresh_token?: string };
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Phase B FAIL: missing access_token or refresh_token in response');
    }

    const { decodeProtectedHeader, decodeJwt } = await import('jose');
    const jtiPrefix = (decodeJwt(tokens.access_token).jti as string | undefined)?.slice(0, 8) ?? 'n/a';
    const kidPrefix = decodeProtectedHeader(idToken).kid?.slice(0, 8) ?? 'n/a';
    console.log(JSON.stringify({ phase: 'B', status: 'pass', jtiPrefix, kidPrefix }));

  } finally {
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: env.COGNITO_USER_POOL_ID,
      Username: smokeEmail,
    })).catch((err: unknown) => {
      console.error('cleanup failed:', err instanceof Error ? err.name : String(err));
    });
  }
}

async function main(): Promise<void> {
  console.log('=== Cognito Smoke Test ===');
  await runPhaseA();
  await runPhaseB();
  console.log('✅ All phases passed.');
}

main().catch((err: unknown) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
