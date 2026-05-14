import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const MODULE_PATH = '../../src/clients/usda-fdc.client.ts';
const API_KEY = 'test-usda-key';

type FetchInit = Parameters<typeof fetch>[1];

interface Helpers {
  searchFood: typeof import('../../src/clients/usda-fdc.client.ts').searchFood;
  getFoodDetail: typeof import('../../src/clients/usda-fdc.client.ts').getFoodDetail;
  UsdaClientError: typeof import('../../src/clients/usda-fdc.client.ts').UsdaClientError;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function resolveHeader(init: FetchInit | undefined, key: string): string | null {
  if (!init || !init.headers) {
    return null;
  }
  const target = key.toLowerCase();
  const headers = init.headers;
  if (headers instanceof Headers) {
    return headers.get(key);
  }
  if (Array.isArray(headers)) {
    for (const [name, value] of headers) {
      if (name.toLowerCase() === target) {
        return value;
      }
    }
    return null;
  }
  const record = headers as Record<string, string>;
  if (record[key] !== undefined) {
    return record[key];
  }
  for (const [name, value] of Object.entries(record)) {
    if (name.toLowerCase() === target) {
      return value;
    }
  }
  return null;
}

async function loadClient(): Promise<Helpers> {
  const mod = await import(MODULE_PATH);
  return {
    searchFood: mod.searchFood,
    getFoodDetail: mod.getFoodDetail,
    UsdaClientError: mod.UsdaClientError,
  };
}

describe('usda-fdc.client', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.useRealTimers();
  });

  it('searchFood happy path sends header and parses results', async () => {
    const { searchFood } = await loadClient();
    const foods = [{ fdcId: 123, description: 'Almond Milk', dataType: 'Branded' }];
    fetchSpy.mockResolvedValueOnce(jsonResponse({ foods }));

    const promise = searchFood('almond milk', { apiKey: API_KEY });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(200);
    const results = await promise;

    expect(results).toEqual(foods);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).pathname).toBe('/fdc/v1/foods/search');
    expect((url as URL).searchParams.has('api_key')).toBe(false);
    expect(resolveHeader(init, 'X-Api-Key')).toBe(API_KEY);
  });

  it('searchFood rejects absolute URL query to guard SSRF', async () => {
    const { searchFood, UsdaClientError } = await loadClient();
    await expect(searchFood('http://evil.com/', { apiKey: API_KEY })).rejects.toThrow(UsdaClientError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('searchFood retries on 429 once and succeeds', async () => {
    const { searchFood } = await loadClient();
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'rate limit' }, 429));
    fetchSpy.mockResolvedValueOnce(jsonResponse({ foods: [{ fdcId: 456, description: 'Walnut', dataType: 'SR Legacy' }] }));

    const promise = searchFood('walnut', { apiKey: API_KEY, maxRetries: 2 });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(200);
    const results = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(results).toEqual([{ fdcId: 456, description: 'Walnut', dataType: 'SR Legacy' }]);
  });

  it('searchFood exhausts retries after repeated 429', async () => {
    const { searchFood, UsdaClientError } = await loadClient();
    fetchSpy.mockImplementation(() => jsonResponse({ message: 'rate limit' }, 429));

    const promise = searchFood('pecan', { apiKey: API_KEY, maxRetries: 2 });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(2000);
    const error = await promise.catch((err) => err);

    expect(error).toBeInstanceOf(UsdaClientError);
    expect(error.message).toContain('status: 429');
    expect(error.message).not.toContain('api_key');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('getFoodDetail times out and wraps AbortError', async () => {
    const { getFoodDetail, UsdaClientError } = await loadClient();
    fetchSpy.mockImplementation((_input, init) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const promise = getFoodDetail(9999, { apiKey: API_KEY, timeoutMs: 50, maxRetries: 0 });
    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    const error = await promise.catch((err) => err);

    expect(error).toBeInstanceOf(UsdaClientError);
    expect(error.message).toBe('request aborted by timeout');
    expect(error.message).not.toContain('api_key');
  });

  it('getFoodDetail API error redacts api key (no api_key in error)', async () => {
    const { getFoodDetail, UsdaClientError } = await loadClient();
    fetchSpy.mockImplementation((input) => {
      if (input instanceof URL) {
        input.searchParams.set('api_key', 'leaked-key');
      }
      return Promise.resolve(new Response('bad request', { status: 400 }));
    });

    const error = await getFoodDetail(1010, { apiKey: API_KEY, maxRetries: 0 }).catch((err) => err);

    expect(error).toBeInstanceOf(UsdaClientError);
    expect(error.message).not.toContain('api_key');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
