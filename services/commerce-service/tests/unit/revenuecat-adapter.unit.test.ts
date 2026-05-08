import { jest } from '@jest/globals';
import {
  RevenuecatAdapter,
  RevenuecatUnavailableError,
} from '../../src/adapters/revenuecat.adapter.js';

let fetchSpy: jest.SpiedFunction<typeof globalThis.fetch>;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

const ADAPTER_OPTS = {
  apiKey: 'rc-secret-key',
  baseUrl: 'https://api.revenuecat.com',
  timeoutMs: 1_000,
};

function makeSubscriberPayload(overrides: {
  expires_date?: string | null;
  product_identifier?: string;
  purchase_date?: string;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
}): unknown {
  return {
    subscriber: {
      original_app_user_id: 'rc-user-original',
      entitlements: {
        premium: {
          product_identifier: overrides.product_identifier ?? 'celebbase_premium_monthly',
          expires_date: overrides.expires_date === undefined ? '2099-01-01T00:00:00Z' : overrides.expires_date,
          purchase_date: overrides.purchase_date ?? '2026-01-01T00:00:00Z',
          unsubscribe_detected_at: overrides.unsubscribe_detected_at ?? null,
          billing_issues_detected_at: overrides.billing_issues_detected_at ?? null,
        },
      },
      management_url: 'https://apps.apple.com/account/subscriptions',
    },
  };
}

describe('RevenuecatAdapter.getSubscriber — success', () => {
  it('returns subscriber snapshot with mapped entitlements on 200', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(makeSubscriberPayload({})), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    const result = await adapter.getSubscriber('rc-user-abc');

    expect(result.appUserId).toBe('rc-user-abc');
    expect(result.originalAppUserId).toBe('rc-user-original');
    expect(result.managementUrl).toBe('https://apps.apple.com/account/subscriptions');
    expect(result.entitlements).toHaveProperty('premium');
    expect(result.entitlements.premium?.product_identifier).toBe('celebbase_premium_monthly');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.revenuecat.com/v1/subscribers/rc-user-abc');
    expect(calledInit.method).toBe('GET');
    expect((calledInit.headers as Record<string, string>)['Authorization']).toBe('Bearer rc-secret-key');
    expect((calledInit.headers as Record<string, string>)['Accept']).toBe('application/json');
  });

  it('marks entitlement is_active=true when expires_date is in the future', async () => {
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(makeSubscriberPayload({ expires_date: future })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    const result = await adapter.getSubscriber('rc-user-abc');

    expect(result.entitlements.premium?.is_active).toBe(true);
    expect(result.entitlements.premium?.expires_date).toBe(future);
  });

  it('marks entitlement is_active=false when expires_date is in the past', async () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(makeSubscriberPayload({ expires_date: past })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    const result = await adapter.getSubscriber('rc-user-abc');

    expect(result.entitlements.premium?.is_active).toBe(false);
  });

  it('treats null expires_date (lifetime) as is_active=true', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(makeSubscriberPayload({ expires_date: null })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    const result = await adapter.getSubscriber('rc-user-abc');

    expect(result.entitlements.premium?.is_active).toBe(true);
    expect(result.entitlements.premium?.expires_date).toBeNull();
  });

  it('encodes special characters in appUserId path', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(makeSubscriberPayload({})), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    await adapter.getSubscriber('user/with spaces');

    const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.revenuecat.com/v1/subscribers/user%2Fwith%20spaces');
  });

  it('strips trailing slash from baseUrl', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(makeSubscriberPayload({})), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const adapter = new RevenuecatAdapter({ ...ADAPTER_OPTS, baseUrl: 'https://api.revenuecat.com/' });
    await adapter.getSubscriber('rc-user-abc');

    const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.revenuecat.com/v1/subscribers/rc-user-abc');
  });
});

describe('RevenuecatAdapter.getSubscriber — error paths', () => {
  it('throws RevenuecatUnavailableError immediately for empty appUserId', async () => {
    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    await expect(adapter.getSubscriber('')).rejects.toBeInstanceOf(RevenuecatUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws RevenuecatUnavailableError on non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    await expect(adapter.getSubscriber('rc-user-missing')).rejects.toBeInstanceOf(
      RevenuecatUnavailableError,
    );
  });

  it('wraps the underlying error as cause on RevenuecatUnavailableError', async () => {
    fetchSpy.mockResolvedValue(
      new Response('upstream down', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    try {
      await adapter.getSubscriber('rc-user-abc');
      throw new Error('expected RevenuecatUnavailableError');
    } catch (err) {
      expect(err).toBeInstanceOf(RevenuecatUnavailableError);
      const cause = (err as RevenuecatUnavailableError).cause;
      expect(cause).toBeInstanceOf(Error);
      expect(String((cause as Error).message)).toContain('503');
    }
  });

  it('throws RevenuecatUnavailableError when fetch itself rejects (network error)', async () => {
    fetchSpy.mockRejectedValue(new Error('socket hang up'));
    const adapter = new RevenuecatAdapter(ADAPTER_OPTS);
    await expect(adapter.getSubscriber('rc-user-abc')).rejects.toBeInstanceOf(
      RevenuecatUnavailableError,
    );
  });
});
