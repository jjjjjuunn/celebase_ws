// IMPL-MOBILE-SOCIAL-NATIVE-001 — native Apple / Google verifier unit tests.
//
// The mock JWKS server signs tokens with a throwaway RS256 key; we point each
// provider's (test-only) jwksUri at it and mint tokens carrying the REAL Apple
// / Google issuer + audience claims. This exercises the forgery barrier
// (iss + aud + sig + exp) without touching the network.

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const { startMockJwksServer } = (await import(
  '../../../../packages/service-core/tests/helpers/mock-jwks-server.js'
)) as typeof import('../../../../packages/service-core/tests/helpers/mock-jwks-server.js');
const { AppleAuthProvider, GoogleAuthProvider, parseGoogleClientIds } = await import(
  '../../src/services/social-auth.provider.js'
);
const { UnauthorizedError } = await import('@celebbase/service-core');

type MockJwksHandle = Awaited<ReturnType<typeof startMockJwksServer>>;

const APPLE_ISSUER = 'https://appleid.apple.com';
const BUNDLE_ID = 'com.celebase.mobile';
const GOOGLE_WEB_ID = '111-web.apps.googleusercontent.com';
const GOOGLE_IOS_ID = '222-ios.apps.googleusercontent.com';

describe('AppleAuthProvider.verifyIdToken', () => {
  let jwks: MockJwksHandle;
  let provider: InstanceType<typeof AppleAuthProvider>;

  beforeAll(async () => {
    jwks = await startMockJwksServer();
    provider = new AppleAuthProvider({ bundleId: BUNDLE_ID, jwksUri: jwks.jwksUri });
  });

  afterAll(async () => {
    await jwks.stop();
  });

  it('accepts a valid token and namespaces the sub with apple:', async () => {
    const token = await jwks.mintIdToken({
      sub: '000123.abc',
      email: 'apple-user@example.com',
      issuer: APPLE_ISSUER,
      audience: BUNDLE_ID,
    });

    const payload = await provider.verifyIdToken(token);

    expect(payload.sub).toBe('apple:000123.abc');
    expect(payload.email).toBe('apple-user@example.com');
  });

  it('returns empty email when Apple omits it (re-sign-in)', async () => {
    const token = await jwks.mintIdToken({
      sub: '000123.abc',
      email: '',
      issuer: APPLE_ISSUER,
      audience: BUNDLE_ID,
    });

    const payload = await provider.verifyIdToken(token);

    expect(payload.sub).toBe('apple:000123.abc');
    expect(payload.email).toBe('');
  });

  it('rejects a token whose aud is not the bundle ID', async () => {
    const token = await jwks.mintIdToken({
      issuer: APPLE_ISSUER,
      audience: 'com.someone.else',
    });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a token with a non-Apple issuer', async () => {
    const token = await jwks.mintIdToken({
      issuer: 'https://accounts.google.com',
      audience: BUNDLE_ID,
    });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects an expired token', async () => {
    const token = await jwks.mintIdToken({
      issuer: APPLE_ISSUER,
      audience: BUNDLE_ID,
      expiresIn: '-2m',
    });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a token signed by an unknown kid', async () => {
    const token = await jwks.mintIdToken({
      issuer: APPLE_ISSUER,
      audience: BUNDLE_ID,
      kid: 'not-my-key',
    });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a garbage string', async () => {
    await expect(provider.verifyIdToken('not.a.jwt')).rejects.toThrow(UnauthorizedError);
  });
});

describe('GoogleAuthProvider.verifyIdToken', () => {
  let jwks: MockJwksHandle;
  let provider: InstanceType<typeof GoogleAuthProvider>;

  beforeAll(async () => {
    jwks = await startMockJwksServer();
    provider = new GoogleAuthProvider({
      allowedClientIds: [GOOGLE_WEB_ID, GOOGLE_IOS_ID],
      jwksUri: jwks.jwksUri,
    });
  });

  afterAll(async () => {
    await jwks.stop();
  });

  it('accepts a valid token (bare issuer) and namespaces the sub with google:', async () => {
    const token = await jwks.mintIdToken({
      sub: '1078-google-sub',
      email: 'g-user@example.com',
      issuer: 'accounts.google.com',
      audience: GOOGLE_WEB_ID,
    });

    const payload = await provider.verifyIdToken(token);

    expect(payload.sub).toBe('google:1078-google-sub');
    expect(payload.email).toBe('g-user@example.com');
  });

  it('accepts the https:// issuer spelling too', async () => {
    const token = await jwks.mintIdToken({
      sub: '1078-google-sub',
      email: 'g-user@example.com',
      issuer: 'https://accounts.google.com',
      audience: GOOGLE_WEB_ID,
    });
    const payload = await provider.verifyIdToken(token);
    expect(payload.sub).toBe('google:1078-google-sub');
  });

  it('accepts a second allowlisted client ID (iOS)', async () => {
    const token = await jwks.mintIdToken({
      sub: 's2',
      email: 'g2@example.com',
      issuer: 'accounts.google.com',
      audience: GOOGLE_IOS_ID,
    });
    const payload = await provider.verifyIdToken(token);
    expect(payload.sub).toBe('google:s2');
  });

  it('rejects an aud that is not in the allowlist', async () => {
    const token = await jwks.mintIdToken({
      issuer: 'accounts.google.com',
      audience: '999-evil.apps.googleusercontent.com',
    });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a non-Google issuer', async () => {
    const token = await jwks.mintIdToken({
      issuer: APPLE_ISSUER,
      audience: GOOGLE_WEB_ID,
    });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a token missing the email claim', async () => {
    const token = await jwks.mintIdToken({
      issuer: 'accounts.google.com',
      audience: GOOGLE_WEB_ID,
      email: '',
    });
    await expect(provider.verifyIdToken(token)).rejects.toThrow('Missing email claim');
  });
});

describe('parseGoogleClientIds', () => {
  it('returns null for undefined / empty', () => {
    expect(parseGoogleClientIds(undefined)).toBeNull();
    expect(parseGoogleClientIds('')).toBeNull();
    expect(parseGoogleClientIds('  ,  ')).toBeNull();
  });

  it('splits, trims, and drops blanks', () => {
    expect(parseGoogleClientIds(` ${GOOGLE_WEB_ID} , ${GOOGLE_IOS_ID} ,`)).toEqual([
      GOOGLE_WEB_ID,
      GOOGLE_IOS_ID,
    ]);
  });
});
