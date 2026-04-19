import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  startMockJwksServer,
  type MockJwksHandle,
} from '../../../../packages/service-core/tests/helpers/mock-jwks-server.js';
import { CognitoAuthProvider } from '../../src/services/cognito-auth.provider.js';
import { UnauthorizedError } from '@celebbase/service-core';

describe('CognitoAuthProvider.verifyIdToken', () => {
  let jwks: MockJwksHandle;
  let provider: CognitoAuthProvider;

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
    const token = await jwks.mintIdToken({
      sub: 'cognito-abc',
      email: 'user@example.com',
    });

    const payload = await provider.verifyIdToken(token);

    expect(payload.sub).toBe('cognito-abc');
    expect(payload.email).toBe('user@example.com');
  });

  it('rejects a token with wrong audience', async () => {
    const token = await jwks.mintIdToken({ audience: 'other-client' });

    await expect(provider.verifyIdToken(token)).rejects.toThrow(UnauthorizedError);
    await expect(provider.verifyIdToken(token)).rejects.toThrow(
      'Invalid or expired id token',
    );
  });

  it('rejects a token with wrong issuer', async () => {
    const token = await jwks.mintIdToken({
      issuer: 'https://evil.example.com/',
    });
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
    await expect(provider.verifyIdToken('not.a.jwt')).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('rejects a token missing the email claim', async () => {
    // Mint with empty email — our helper forces a string, so we go via malformed path
    const token = await jwks.mintIdToken({ email: '' });
    await expect(provider.verifyIdToken(token)).rejects.toThrow('Missing email claim');
  });
});

describe('CognitoAuthProvider.issueTokens / refreshTokens', () => {
  let jwks: MockJwksHandle;
  let provider: CognitoAuthProvider;

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
    const tokens = await provider.issueTokens({
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

  it('refreshTokens preserves the subject across rotation', async () => {
    const initial = await provider.issueTokens({
      sub: 'user-uuid-2',
      email: 'bob@example.com',
      cognito_sub: 'cognito-xyz',
    });

    const rotated = await provider.refreshTokens(initial.refresh_token);
    const payload = JSON.parse(
      Buffer.from(rotated.access_token.split('.')[1]!, 'base64url').toString(),
    ) as { sub: string; email: string };

    expect(payload.sub).toBe('user-uuid-2');
    expect(payload.email).toBe('bob@example.com');
  });

  it('refreshTokens rejects an access token', async () => {
    const tokens = await provider.issueTokens({
      sub: 'user-uuid-3',
      email: 'c@example.com',
      cognito_sub: 'cognito-3',
    });
    await expect(provider.refreshTokens(tokens.access_token)).rejects.toThrow(
      'Invalid token: expected refresh token',
    );
  });
});
