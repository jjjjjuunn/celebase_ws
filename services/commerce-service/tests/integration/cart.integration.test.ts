import { jest } from '@jest/globals';
import { createCart } from '../../src/services/cart-fallback.service.js';
import { InstacartUnavailableError } from '../../src/adapters/instacart.adapter.js';
import type { CartItem } from '../../src/types/cart.js';

const ITEMS: CartItem[] = [
  { productId: 'prod-001', quantity: 2 },
  { productId: 'prod-002', quantity: 1 },
];

const CHECKOUT_URL = 'https://instacart.com/checkout/test-cart-id';
const AMAZON_URL = 'https://www.amazon.com/s?k=prod-001%2Cprod-002&tag=celebbase-20';

function makeInstacartSuccess() {
  return {
    createCart: jest.fn().mockResolvedValue({
      cartId: 'test-cart-id',
      checkoutUrl: CHECKOUT_URL,
    }),
  };
}

function makeInstacartFailing() {
  return {
    createCart: jest.fn().mockRejectedValue(
      new InstacartUnavailableError('Instacart unavailable'),
    ),
  };
}

function makeAmazonFreshSuccess() {
  return { createCartUrl: jest.fn().mockReturnValue(AMAZON_URL) };
}

function makeAmazonFreshEmpty() {
  return { createCartUrl: jest.fn().mockReturnValue('') };
}

afterEach(() => {
  delete process.env.REGIONAL_GROCER_URL;
});

describe('createCart — Instacart success', () => {
  it('returns instacart source and checkout URL', async () => {
    const instacartAdapter = makeInstacartSuccess();
    const amazonFreshAdapter = makeAmazonFreshEmpty();

    const result = await createCart({ items: ITEMS, instacartAdapter, amazonFreshAdapter });

    expect(result.source).toBe('instacart');
    expect((result as { source: string; url: string }).url).toBe(CHECKOUT_URL);
    expect(instacartAdapter.createCart).toHaveBeenCalledWith(ITEMS);
  });
});

describe('createCart — Amazon Fresh fallback', () => {
  it('falls back to amazon_fresh when Instacart throws InstacartUnavailableError', async () => {
    const instacartAdapter = makeInstacartFailing();
    const amazonFreshAdapter = makeAmazonFreshSuccess();

    const result = await createCart({ items: ITEMS, instacartAdapter, amazonFreshAdapter });

    expect(result.source).toBe('amazon_fresh');
    expect((result as { source: string; url: string }).url).toBe(AMAZON_URL);
    expect(amazonFreshAdapter.createCartUrl).toHaveBeenCalledWith(ITEMS);
  });
});

describe('createCart — checklist fallback', () => {
  it('returns checklist when both Instacart and Amazon fail', async () => {
    const instacartAdapter = makeInstacartFailing();
    const amazonFreshAdapter = makeAmazonFreshEmpty();

    const result = await createCart({ items: ITEMS, instacartAdapter, amazonFreshAdapter });

    expect(result.source).toBe('checklist');
    expect((result as { source: string; items: CartItem[] }).items).toEqual(ITEMS);
  });

  it('returns regional when REGIONAL_GROCER_URL is set and Amazon is empty', async () => {
    process.env.REGIONAL_GROCER_URL = 'https://regional-grocer.example.com';
    const instacartAdapter = makeInstacartFailing();
    const amazonFreshAdapter = makeAmazonFreshEmpty();

    const result = await createCart({ items: ITEMS, instacartAdapter, amazonFreshAdapter });

    expect(result.source).toBe('regional');
    expect((result as { source: string; url: string }).url).toBe('https://regional-grocer.example.com');
  });
});
