// FEAT-APPLE-REVOKE-001 — store + revoke best-effort behaviour + audit.
//
// Real AES-256 encrypt/decrypt (EnvPhiKeyProvider) exercises the round-trip;
// the DB repo is mocked (no Postgres in a unit test) and the Apple client is an
// injected fake (no network). Asserts: never throws, correct audit outcome,
// no-token short-circuit, and that revoke receives the ORIGINAL token.

import { jest } from '@jest/globals';
import { describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

const mockSet = jest.fn<(pool: unknown, id: string, enc: string) => Promise<void>>();
const mockGet = jest.fn<(pool: unknown, id: string) => Promise<string | null>>();
jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({
  setAppleRefreshToken: mockSet,
  getAppleRefreshToken: mockGet,
}));

const { storeAppleRefreshToken, revokeAppleRefreshToken } = await import(
  '../../src/services/apple-token-store.js'
);
const { EnvPhiKeyProvider } = await import('@celebbase/service-core');

const keyProvider = new EnvPhiKeyProvider('a'.repeat(64));
const POOL = {} as unknown as pg.Pool;
const USER_ID = '018d1a6a-0000-7000-8000-000000000001';

interface CapturedEvent {
  event: string;
  outcome: string;
}
function makeLog(): { events: CapturedEvent[]; info: jest.Mock; warn: jest.Mock } {
  const events: CapturedEvent[] = [];
  const push = (o: unknown): void => {
    if (o !== null && typeof o === 'object') events.push(o as CapturedEvent);
  };
  return { events, info: jest.fn(push), warn: jest.fn(push) };
}

function makeApple() {
  return {
    exchangeAuthorizationCode: jest.fn<(code: string) => Promise<string>>(),
    revokeRefreshToken: jest.fn<(token: string) => Promise<void>>(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('storeAppleRefreshToken', () => {
  it('exchanges, encrypts (not plaintext), persists, audits exchanged', async () => {
    const apple = makeApple();
    apple.exchangeAuthorizationCode.mockResolvedValue('refresh-token-123');
    const log = makeLog();

    await storeAppleRefreshToken({
      pool: POOL,
      userId: USER_ID,
      authorizationCode: 'auth-code-xyz',
      appleOAuth: apple,
      keyProvider,
      log,
      requestId: 'req-1',
    });

    expect(apple.exchangeAuthorizationCode).toHaveBeenCalledWith('auth-code-xyz');
    expect(mockSet).toHaveBeenCalledTimes(1);
    const storedEnc = mockSet.mock.calls[0]?.[2];
    expect(typeof storedEnc).toBe('string');
    expect(storedEnc).not.toContain('refresh-token-123'); // encrypted, not plaintext
    expect(log.events.some((e) => e.event === 'auth.apple.token_stored' && e.outcome === 'exchanged')).toBe(true);
  });

  it('does NOT throw and does NOT clobber on exchange failure (audits exchange_failed)', async () => {
    const apple = makeApple();
    apple.exchangeAuthorizationCode.mockRejectedValue(new Error('apple 400 invalid_grant'));
    const log = makeLog();

    await expect(
      storeAppleRefreshToken({
        pool: POOL,
        userId: USER_ID,
        authorizationCode: 'auth-code-xyz',
        appleOAuth: apple,
        keyProvider,
        log,
        requestId: 'req-2',
      }),
    ).resolves.toBeUndefined();

    expect(mockSet).not.toHaveBeenCalled(); // no-clobber
    expect(log.events.some((e) => e.event === 'auth.apple.token_stored' && e.outcome === 'exchange_failed')).toBe(true);
  });
});

describe('revokeAppleRefreshToken', () => {
  it('decrypts the stored token and revokes the ORIGINAL value (round-trip), audits revoked', async () => {
    // First store to obtain a real encrypted envelope for the same user/key.
    const apple = makeApple();
    apple.exchangeAuthorizationCode.mockResolvedValue('refresh-token-RT');
    await storeAppleRefreshToken({
      pool: POOL,
      userId: USER_ID,
      authorizationCode: 'c',
      appleOAuth: apple,
      keyProvider,
      log: makeLog(),
      requestId: 'req-store',
    });
    const enc = mockSet.mock.calls[0]?.[2] as string;

    mockGet.mockResolvedValue(enc);
    const log = makeLog();
    await revokeAppleRefreshToken({
      pool: POOL,
      userId: USER_ID,
      appleOAuth: apple,
      keyProvider,
      log,
      requestId: 'req-revoke',
    });

    expect(apple.revokeRefreshToken).toHaveBeenCalledWith('refresh-token-RT');
    expect(log.events.some((e) => e.event === 'auth.apple.token_revoked' && e.outcome === 'revoked')).toBe(true);
  });

  it('short-circuits when no token stored (audits no_token_stored, no revoke call)', async () => {
    const apple = makeApple();
    mockGet.mockResolvedValue(null);
    const log = makeLog();

    await revokeAppleRefreshToken({
      pool: POOL,
      userId: USER_ID,
      appleOAuth: apple,
      keyProvider,
      log,
      requestId: 'req-3',
    });

    expect(apple.revokeRefreshToken).not.toHaveBeenCalled();
    expect(log.events.some((e) => e.event === 'auth.apple.token_revoked' && e.outcome === 'no_token_stored')).toBe(true);
  });

  it('does NOT throw on revoke failure (audits revoke_failed)', async () => {
    const apple = makeApple();
    apple.exchangeAuthorizationCode.mockResolvedValue('refresh-token-RT');
    await storeAppleRefreshToken({
      pool: POOL,
      userId: USER_ID,
      authorizationCode: 'c',
      appleOAuth: apple,
      keyProvider,
      log: makeLog(),
      requestId: 'req-store2',
    });
    const enc = mockSet.mock.calls[0]?.[2] as string;
    mockGet.mockResolvedValue(enc);
    apple.revokeRefreshToken.mockRejectedValue(new Error('apple 503'));
    const log = makeLog();

    await expect(
      revokeAppleRefreshToken({
        pool: POOL,
        userId: USER_ID,
        appleOAuth: apple,
        keyProvider,
        log,
        requestId: 'req-4',
      }),
    ).resolves.toBeUndefined();

    expect(log.events.some((e) => e.event === 'auth.apple.token_revoked' && e.outcome === 'revoke_failed')).toBe(true);
  });
});
