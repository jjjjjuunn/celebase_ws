import { CircuitBreaker } from '@celebbase/service-core';
import { createLogger } from '@celebbase/service-core';
import type { CartItem, InstacartCartResult } from '../types/cart.js';

export class InstacartUnavailableError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'InstacartUnavailableError';
    this.cause = cause;
  }
}

interface InstacartAdapterOpts {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3_000;

export class InstacartAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly breaker: CircuitBreaker;
  private readonly log = createLogger('commerce-service');

  constructor(opts: InstacartAdapterOpts) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.breaker = new CircuitBreaker({
      name: 'instacart',
      threshold: 5,
      timeoutMs: 30_000,
    });
  }

  async createCart(items: CartItem[]): Promise<InstacartCartResult> {
    if (items.length === 0) {
      throw new InstacartUnavailableError('Cart must contain at least one item');
    }

    try {
      return await this.breaker.execute(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const url = `${this.baseUrl}/v2/carts`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({ items }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const bodyText = await response.text();
            this.log.warn('instacart.cart.error', {
              status: response.status,
              body: bodyText.slice(0, 200),
            });
            throw new Error(`Instacart API error: ${String(response.status)}`);
          }

          const data = (await response.json()) as { cart_id: string; checkout_url: string };
          return { cartId: data.cart_id, checkoutUrl: data.checkout_url };
        } finally {
          clearTimeout(timer);
        }
      });
    } catch (err) {
      if ((err as Error).message.startsWith('circuit breaker open')) {
        this.log.warn('instacart.breaker.open', {
          failureCount: 5,
          threshold: 5,
          cooldownUntil: Date.now() + 30_000,
        });
      }
      throw new InstacartUnavailableError('Instacart unavailable', err);
    }
  }
}
