import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type pg from 'pg';

// Phase C: issueInternalTokens calls refreshTokenRepo.insert — mock to avoid real DB
jest.unstable_mockModule('../../src/repositories/refresh-token.repository.js', () => ({
  insert: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  revokeForRotation: jest.fn(),
  findMetadata: jest.fn(),
  revokeForLogout: jest.fn(),
  revokeChainForLogout: jest.fn(),
  revokeAllByUser: jest.fn(),
}));

const { startMockJwksServer } = await import(
  '../../../../packages/service-core/tests/helpers/mock-jwks-server.js'
) as typeof import('../../../../packages/service-core/tests/helpers/mock-jwks-server.js');
const { CognitoAuthProvider } = await import('../../src/services/cognito-auth.provider.js');
const { UnauthorizedError } = await import('@celebbase/service-core');

type MockJwksHandle = Awaited<ReturnType<typeof startMockJwksServer>>;

const mockPool = {} as pg.Pool;

describe('CognitoAuthProvider.verifyIdToken', () => {
  let jwks: MockJwksHandle;
  let provider: InstanceType<typeof CognitoAuthProvider>;

  beforeAll(async () => {
    jwks = await startMockJwksServer();
    provider = new CognitoAuthProvider({
      userPoolId: 'mock-pool',
      clientId: jwks.audience,
      region: 'us-west-2',
      jwksUri: jwks.jwksUri,
      issuer: jwks.issuer,
    });
  });

  afterAll(async () => {
    await jwks.stop();
  });

  it('accepts a valid id_token and returns sub + email', async () => {
    const token = await jwks.mintIdToken({ sub: 'cognito-abc', email: 'user@example.com' });

    const payload = await provider.verifyIdToken(token);

    expect(payload.sub).toBe('cognito-abc');
    expect(payload.email).toBe('user@example.com');
  });

  it('rejects a token with wrong audience', async () => {
    const token = await jwks.mintIdToken({ audience: 'other-client' });

    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
    await expect(provider.verifyIdToken(token)).rejects.toThrow('Invalid or expired id token');
  });

  it('rejects a token with wrong issuer', async () => {
    const token = await jwks.mintIdToken({ issuer: 'https://evil.example.com/' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a token with token_use=access', async () => {
    const token = await jwks.mintIdToken({ token_use: 'access' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow('Expected id token');
  });

  it('rejects an expired token (outside clockTolerance)', async () => {
    const token = await jwks.mintIdToken({ expiresIn: '-2m' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a token signed by an unknown kid', async () => {
    const token = await jwks.mintIdToken({ kid: 'not-my-key' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a garbage string', async () => {
    await expect(provider.verifyIdToken('not.a.jwt')).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a token missing the email claim', async () => {
    const token = await jwks.mintIdToken({ email: '' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow('Missing email claim');
  });
});

describe('CognitoAuthProvider.issueTokens', () => {
  let jwks: MockJwksHandle;
  let provider: InstanceType<typeof CognitoAuthProvider>;

  beforeAll(async () => {
    jwks = await startMockJwksServer();
    provider = new CognitoAuthProvider({
      userPoolId: 'mock-pool',
      clientId: jwks.audience,
      region: 'us-west-2',
      jwksUri: jwks.jwksUri,
      issuer: jwks.issuer,
    });
  });

  afterAll(async () => {
    await jwks.stop();
  });

  it('issues internal HS256 tokens carrying sub + email + cognito_sub', async () => {
    const tokens = await provider.issueTokens(mockPool, {
      sub: 'user-uuid-1',
      email: 'alice@example.com',
      cognito_sub: 'cognito-abc',
    });

    const parts = tokens.access_token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString(),
    ) as { sub: string; email: string; cognito_sub: string; token_use: string };

    expect(payload.sub).toBe('user-uuid-1');
    expect(payload.email).toBe('alice@example.com');
    expect(payload.cognito_sub).toBe('cognito-abc');
    expect(payload.token_use).toBe('access');
  });

  it('refresh token contains jti claim (Phase C)', async () => {
    const tokens = await provider.issueTokens(mockPool, {
      sub: 'user-uuid-2',
      email: 'bob@example.com',
      cognito_sub: 'cognito-xyz',
    });

    const parts = tokens.refresh_token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString(),
    ) as { jti?: string; token_use: string };

    expect(payload.token_use).toBe('refresh');
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti!.length).toBeGreaterThan(0);
  });

  it('access token TTL is 15m (Phase C)', async () => {
    const tokens = await provider.issueTokens(mockPool, {
      sub: 'user-uuid-3',
      email: 'c@example.com',
      cognito_sub: 'cognito-3',
    });

    const parts = tokens.access_token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString(),
    ) as { exp: number; iat: number };
    const ttl = payload.exp - payload.iat;
    expect(ttl).toBeLessThanOrEqual(15 * 60 + 5);
    expect(ttl).toBeGreaterThan(0);
  });
});

// IMPL-MOBILE-AUTH-001 — audience array (web BFF + mobile native client)
describe('CognitoAuthProvider.verifyIdToken — mobile audience', () => {
  let jwks: MockJwksHandle;
  let provider: InstanceType<typeof CognitoAuthProvider>;
  const MOBILE_AUD = 'mobile-client-id';

  beforeAll(async () => {
    jwks = await startMockJwksServer();
    provider = new CognitoAuthProvider({
      userPoolId: 'mock-pool',
      clientId: jwks.audience,
      mobileClientId: MOBILE_AUD,
      region: 'us-west-2',
      jwksUri: jwks.jwksUri,
      issuer: jwks.issuer,
    });
  });

  afterAll(async () => {
    await jwks.stop();
  });

  it('accepts a token with web (BFF) audience', async () => {
    const token = await jwks.mintIdToken({ sub: 'web-user', email: 'web@example.com' });
    const payload = await provider.verifyIdToken(token);
    expect(payload.sub).toBe('web-user');
  });

  it('accepts a token with mobile audience', async () => {
    const token = await jwks.mintIdToken({
      sub: 'mobile-user',
      email: 'mobile@example.com',
      audience: MOBILE_AUD,
    });
    const payload = await provider.verifyIdToken(token);
    expect(payload.sub).toBe('mobile-user');
  });

  it('rejects a token with audience matching neither web nor mobile', async () => {
    const token = await jwks.mintIdToken({ audience: 'unknown-client' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });
});

// IMPL-MOBILE-AUTH-001 — single-audience regression: mobile aud must be rejected when mobileClientId is NOT configured (web-only mode)
describe('CognitoAuthProvider.verifyIdToken — single audience (web-only mode)', () => {
  let jwks: MockJwksHandle;
  let provider: InstanceType<typeof CognitoAuthProvider>;
  const MOBILE_AUD = 'mobile-client-id';

  beforeAll(async () => {
    jwks = await startMockJwksServer();
    provider = new CognitoAuthProvider({
      userPoolId: 'mock-pool',
      clientId: jwks.audience,
      // mobileClientId intentionally omitted — web-only mode
      region: 'us-west-2',
      jwksUri: jwks.jwksUri,
      issuer: jwks.issuer,
    });
  });

  afterAll(async () => {
    await jwks.stop();
  });

  it('rejects a mobile-audience token when mobileClientId is not configured', async () => {
    const token = await jwks.mintIdToken({ audience: MOBILE_AUD });
    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('still accepts a web-audience token when mobileClientId is not configured', async () => {
    const token = await jwks.mintIdToken({ sub: 'web-only-user', email: 'web@example.com' });
    const payload = await provider.verifyIdToken(token);
    expect(payload.sub).toBe('web-only-user');
  });
});
