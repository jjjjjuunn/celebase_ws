// FEAT-APPLE-REVOKE-001 — Apple OAuth client unit tests.
//
// Apple's token + revoke endpoints are external; per testing-ci.md they are
// mocked at the `fetch` boundary. A throwaway ES256 keypair signs/verifies the
// client_secret JWT so we assert its header (kid/alg) + claims (iss/sub/aud/exp)
// without any real Apple credentials.

import { jest } from '@jest/globals';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { generateKeyPair, exportPKCS8, exportSPKI, importSPKI, jwtVerify } from 'jose';

import {
  appleOAuthConfigFromEnv,
  createAppleOAuthClient,
  AppleOAuthError,
  type AppleOAuthClient,
  type AppleOAuthConfig,
} from '../../src/services/apple-oauth.js';

let config: AppleOAuthConfig;
let publicKeyPem: string;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  config = {
    teamId: 'TEAM123',
    keyId: 'KEY123',
    clientId: 'com.celebase.mobile',
    privateKeyPem: await exportPKCS8(privateKey),
  };
  publicKeyPem = await exportSPKI(publicKey);
});

function client(): AppleOAuthClient {
  const c = createAppleOAuthClient(config);
  if (c === null) throw new Error('expected non-null client');
  return c;
}

function lastBody(spy: ReturnType<typeof jest.spyOn>): URLSearchParams {
  const calls = spy.mock.calls;
  const call = calls[calls.length - 1];
  if (call === undefined) throw new Error('fetch was not called');
  const init = call[1] as RequestInit | undefined;
  return new URLSearchParams(String(init?.body ?? ''));
}

describe('appleOAuthConfigFromEnv', () => {
  it('returns null when no Apple vars set', () => {
    expect(appleOAuthConfigFromEnv({})).toBeNull();
  });

  it('returns null when only some Apple vars set', () => {
    expect(
      appleOAuthConfigFromEnv({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' }),
    ).toBeNull();
  });

  it('returns config when all four set (client_id = Bundle ID)', () => {
    const cfg = appleOAuthConfigFromEnv({
      APPLE_TEAM_ID: 'T',
      APPLE_KEY_ID: 'K',
      APPLE_BUNDLE_ID: 'com.celebase.mobile',
      APPLE_PRIVATE_KEY: 'P',
    });
    expect(cfg).toEqual({
      teamId: 'T',
      keyId: 'K',
      clientId: 'com.celebase.mobile',
      privateKeyPem: 'P',
    });
  });
});

describe('createAppleOAuthClient', () => {
  it('returns null for null config', () => {
    expect(createAppleOAuthClient(null)).toBeNull();
  });
});

describe('AppleOAuthClient', () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('exchange: returns refresh_token and mints a valid ES256 client_secret', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: 'r-123', access_token: 'a-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const refreshToken = await client().exchangeAuthorizationCode('CODE-XYZ');
    expect(refreshToken).toBe('r-123');

    const firstCall = fetchSpy.mock.calls[0];
    if (firstCall === undefined) throw new Error('fetch not called');
    expect(firstCall[0]).toBe('https://appleid.apple.com/auth/token');

    const body = lastBody(fetchSpy);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE-XYZ');
    expect(body.get('client_id')).toBe('com.celebase.mobile');

    const clientSecret = body.get('client_secret');
    if (clientSecret === null) throw new Error('missing client_secret');
    const pub = await importSPKI(publicKeyPem, 'ES256');
    const { payload, protectedHeader } = await jwtVerify(clientSecret, pub, {
      audience: 'https://appleid.apple.com',
      issuer: 'TEAM123',
    });
    expect(protectedHeader.alg).toBe('ES256');
    expect(protectedHeader.kid).toBe('KEY123');
    expect(payload.sub).toBe('com.celebase.mobile');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.iat).toBe('number');
    // 5-minute TTL (advisor): exp - iat == 300.
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(300);
  });

  it('exchange: throws sanitized error (no code leak) when refresh_token missing', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(client().exchangeAuthorizationCode('SECRET-CODE')).rejects.toBeInstanceOf(
      AppleOAuthError,
    );
  });

  it('exchange: surfaces Apple error code + status, never the authorization code', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    let caught: unknown;
    try {
      await client().exchangeAuthorizationCode('SECRET-CODE');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppleOAuthError);
    const message = (caught as Error).message;
    expect(message).toContain('400');
    expect(message).toContain('invalid_grant');
    expect(message).not.toContain('SECRET-CODE');
  });

  it('revoke: posts token + token_type_hint and resolves on empty 200', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 200 }));

    await expect(client().revokeRefreshToken('r-456')).resolves.toBeUndefined();

    const firstCall = fetchSpy.mock.calls[0];
    if (firstCall === undefined) throw new Error('fetch not called');
    expect(firstCall[0]).toBe('https://appleid.apple.com/auth/revoke');

    const body = lastBody(fetchSpy);
    expect(body.get('token')).toBe('r-456');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('com.celebase.mobile');
  });

  it('revoke: throws sanitized error on non-200', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    let caught: unknown;
    try {
      await client().revokeRefreshToken('r-secret');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppleOAuthError);
    expect((caught as Error).message).not.toContain('r-secret');
  });

  it('exchange: throws sanitized error on network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNRESET tcp://appleid'));
    let caught: unknown;
    try {
      await client().exchangeAuthorizationCode('SECRET-CODE');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppleOAuthError);
    expect((caught as Error).message).not.toContain('SECRET-CODE');
  });
});
