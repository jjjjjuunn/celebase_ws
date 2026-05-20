import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type pg from 'pg';
import { generateKeyPair, exportPKCS8, decodeProtectedHeader } from 'jose';

// issueInternalTokens calls refreshTokenRepo.insert — mock to avoid a real DB.
jest.unstable_mockModule('../../src/repositories/refresh-token.repository.js', () => ({
  insert: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  revokeForRotation: jest.fn(),
  findMetadata: jest.fn(),
  revokeForLogout: jest.fn(),
  revokeChainForLogout: jest.fn(),
  revokeAllByUser: jest.fn(),
}));

const mockPool = {} as pg.Pool;

// Phase 2b: when INTERNAL_JWT_PRIVATE_KEY is provisioned, internal tokens are
// signed RS256 with the JWKS `kid` in the header. Without it (CI / local dev)
// they stay HS256 — that path is covered by cognito-auth.provider.test.ts.
describe('issueInternalTokens RS256 signing (CHORE-AUTH-ASYMMETRIC-SIGNING-001 Phase 2b)', () => {
  let savedKey: string | undefined;
  let issueInternalTokens: typeof import('../../src/services/auth.service.js')['issueInternalTokens'];
  let getInternalSigningKey: typeof import('../../src/lib/internal-signing-key.js')['getInternalSigningKey'];
  let resetInternalSigningKeyForTest: typeof import('../../src/lib/internal-signing-key.js')['resetInternalSigningKeyForTest'];

  beforeAll(async () => {
    savedKey = process.env['INTERNAL_JWT_PRIVATE_KEY'];
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    process.env['INTERNAL_JWT_PRIVATE_KEY'] = await exportPKCS8(privateKey);

    ({ issueInternalTokens } = await import('../../src/services/auth.service.js'));
    ({ getInternalSigningKey, resetInternalSigningKeyForTest } = await import(
      '../../src/lib/internal-signing-key.js'
    ));
    resetInternalSigningKeyForTest();
  });

  afterAll(() => {
    if (savedKey === undefined) {
      delete process.env['INTERNAL_JWT_PRIVATE_KEY'];
    } else {
      process.env['INTERNAL_JWT_PRIVATE_KEY'] = savedKey;
    }
    resetInternalSigningKeyForTest();
  });

  it('signs access + refresh RS256 with the JWKS kid', async () => {
    const tokens = await issueInternalTokens(mockPool, {
      sub: 'user-uuid-1',
      email: 'alice@example.com',
      cognito_sub: 'cognito-abc',
    });

    const { kid } = await getInternalSigningKey();
    const accessHeader = decodeProtectedHeader(tokens.access_token);
    const refreshHeader = decodeProtectedHeader(tokens.refresh_token);

    expect(accessHeader.alg).toBe('RS256');
    expect(accessHeader.kid).toBe(kid);
    expect(refreshHeader.alg).toBe('RS256');
    expect(refreshHeader.kid).toBe(kid);
  });

  it('still carries the expected claims under RS256', async () => {
    const tokens = await issueInternalTokens(mockPool, {
      sub: 'user-uuid-2',
      email: 'bob@example.com',
      cognito_sub: 'cognito-xyz',
    });

    const parts = tokens.access_token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as {
      sub: string;
      email: string;
      cognito_sub: string;
      token_use: string;
    };

    expect(payload.sub).toBe('user-uuid-2');
    expect(payload.email).toBe('bob@example.com');
    expect(payload.cognito_sub).toBe('cognito-xyz');
    expect(payload.token_use).toBe('access');
  });
});
