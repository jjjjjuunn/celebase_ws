import { jest } from '@jest/globals';
import { InstacartAdapter, InstacartUnavailableError } from '../../src/adapters/instacart.adapter.js';
import type { CartItem } from '../../src/types/cart.js';

const ITEMS: CartItem[] = [
  { productId: 'prod-001', quantity: 2 },
  { productId: 'prod-002', quantity: 1 },
];

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('InstacartAdapter.createCart — success', () => {
  it('returns cartId and checkoutUrl on 200 response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ cart_id: 'cart-123', checkout_url: 'https://instacart.com/checkout/cart-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new InstacartAdapter({ apiKey: 'test-key', baseUrl: 'https://api.instacart.com' });
    const result = await adapter.createCart(ITEMS);

    expect(result.cartId).toBe('cart-123');
    expect(result.checkoutUrl).toBe('https://instacart.com/checkout/cart-123');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://api.instacart.com/v2/carts');
    expect(calledInit.method).toBe('POST');
    expect((calledInit.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
  });
});

describe('InstacartAdapter.createCart — API error', () => {
  it('throws InstacartUnavailableError on non-ok response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Bad Request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const adapter = new InstacartAdapter({ apiKey: 'test-key', baseUrl: 'https://api.instacart.com' });
    await expect(adapter.createCart(ITEMS)).rejects.toBeInstanceOf(InstacartUnavailableError);
  });

  it('throws InstacartUnavailableError immediately for empty items list', async () => {
    const adapter = new InstacartAdapter({ apiKey: 'test-key', baseUrl: 'https://api.instacart.com' });
    await expect(adapter.createCart([])).rejects.toThrow('Cart must contain at least one item');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws InstacartUnavailableError on network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('network failure'));

    const adapter = new InstacartAdapter({ apiKey: 'test-key', baseUrl: 'https://api.instacart.com' });
    await expect(adapter.createCart(ITEMS)).rejects.toBeInstanceOf(InstacartUnavailableError);
  });
});
