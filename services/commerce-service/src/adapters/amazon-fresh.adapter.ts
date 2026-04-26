import type { CartItem } from '../types/cart.js';

interface AmazonFreshAdapterOpts {
  affiliateTag?: string;
}

export class AmazonFreshAdapter {
  private readonly affiliateTag: string | undefined;

  constructor(opts: AmazonFreshAdapterOpts = {}) {
    this.affiliateTag = opts.affiliateTag;
  }

  createCartUrl(items: CartItem[]): string {
    if (!this.affiliateTag) return '';
    const query = encodeURIComponent(items.map((i) => i.productId).join(','));
    return `https://www.amazon.com/s?k=${query}&tag=${this.affiliateTag}`;
  }
}
