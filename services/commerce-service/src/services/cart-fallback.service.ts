import { createLogger } from '@celebbase/service-core';
import type { AmazonFreshAdapter } from '../adapters/amazon-fresh.adapter.js';
import type { InstacartAdapter } from '../adapters/instacart.adapter.js';
import { InstacartUnavailableError } from '../adapters/instacart.adapter.js';
import type { CartItem, CartResult } from '../types/cart.js';

const log = createLogger('commerce-service');

export interface CreateCartOpts {
  items: CartItem[];
  instacartAdapter: InstacartAdapter;
  amazonFreshAdapter: AmazonFreshAdapter;
}

export async function createCart(opts: CreateCartOpts): Promise<CartResult> {
  const { items, instacartAdapter, amazonFreshAdapter } = opts;

  try {
    const icResult = await instacartAdapter.createCart(items);
    return { source: 'instacart', url: icResult.checkoutUrl } as const;
  } catch (error) {
    if (error instanceof InstacartUnavailableError) {
      log.warn('instacart.fallback.chain', {
        primary: 'instacart',
        selected: 'amazon_fresh',
        reason: error.message,
      });
    } else {
      throw error;
    }
  }

  const afUrl = amazonFreshAdapter.createCartUrl(items);
  if (afUrl) {
    return { source: 'amazon_fresh', url: afUrl } as const;
  }

  const regionalUrl = process.env.REGIONAL_GROCER_URL ?? '';
  if (regionalUrl) {
    log.warn('instacart.fallback.chain', {
      primary: 'instacart',
      selected: 'regional',
      reason: 'amazon_fresh_empty',
    });
    return { source: 'regional', url: regionalUrl } as const;
  }

  log.warn('instacart.fallback.chain', {
    primary: 'instacart',
    selected: 'checklist',
    reason: 'regional_url_empty',
  });
  return { source: 'checklist', items } as const;
}
