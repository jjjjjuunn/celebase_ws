import { jest } from '@jest/globals';
import { decodeJwt } from 'jose';
import { createUserServiceClient } from '../../src/services/user-service.client.js';

const TEST_ENV = {
  USER_SERVICE_URL: 'http://user-service:3001',
  INTERNAL_JWT_SECRET: 'test-internal-secret-exactly-32ch!!',
};

const USER_ID = 'user-fixture-uuid-0001';
const IDEMPOTENCY_KEY = `${USER_ID}:premium:sub_fixture_001`;

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('UserServiceClient.syncTier — success', () => {
  it('calls POST /internal/users/:userId/tier with correct body and resolves', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ userId: USER_ID, tier: 'premium', updated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createUserServiceClient(TEST_ENV);
    await expect(
      client.syncTier(USER_ID, 'premium', { idempotencyKey: IDEMPOTENCY_KEY }),
    ).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(calledUrl.pathname).toBe(`/internal/users/${USER_ID}/tier`);
    expect(calledInit.method).toBe('POST');
    const bodyObj = JSON.parse(calledInit.body as string) as { tier: string };
    expect(bodyObj.tier).toBe('premium');
  });

  it('includes internal JWT with aud=user-service:internal in Authorization header', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ userId: USER_ID, tier: 'premium', updated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createUserServiceClient(TEST_ENV);
    await client.syncTier(USER_ID, 'premium', { idempotencyKey: IDEMPOTENCY_KEY });

    const [, calledInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const authHeader = (calledInit.headers as Record<string, string>)['Authorization'];
    expect(authHeader).toMatch(/^Bearer /);

    const token = authHeader.replace('Bearer ', '');
    const payload = decodeJwt(token);
    expect(payload.aud).toBe('user-service:internal');
    expect(payload.iss).toBe('celebbase-internal');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.jti).toBe('string');
  });
});

describe('UserServiceClient.syncTier — 401 (audience mismatch / unauthorized)', () => {
  it('throws InternalClientError on 401 without retrying', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createUserServiceClient(TEST_ENV);
    await expect(
      client.syncTier(USER_ID, 'premium', { idempotencyKey: IDEMPOTENCY_KEY }),
    ).rejects.toThrow('InternalClientError: 401');

    // 401 is a 4xx — client must NOT retry (retries are only for 5xx / network errors)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('JWT audience guard — external JWT must not pass internal guard', () => {
  it('the issued JWT audience is user-service:internal (not user-service:external)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ userId: USER_ID, tier: 'premium', updated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = createUserServiceClient(TEST_ENV);
    await client.syncTier(USER_ID, 'premium', { idempotencyKey: IDEMPOTENCY_KEY });

    const [, calledInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const token = (calledInit.headers as Record<string, string>)['Authorization'].replace('Bearer ', '');
    const { aud } = decodeJwt(token);

    // commerce-service issues INTERNAL tokens only — external Cognito aud would be 'user-service:external'
    expect(aud).toBe('user-service:internal');
    expect(aud).not.toBe('user-service:external');
  });
});
