import { describe, it, expect } from '@jest/globals';
import { EnvSchema } from '../../src/env.js';

const BASE = {
  DATABASE_URL: 'postgresql://x',
  PHI_ENCRYPTION_KEY: '0'.repeat(64),
  NODE_ENV: 'test',
};

describe('EnvSchema Stripe gate', () => {
  it('parses without Stripe vars when STRIPE_ENABLED=false (default)', () => {
    const result = EnvSchema.parse(BASE);
    expect(result.STRIPE_ENABLED).toBe('false');
    expect(result.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it('parses when STRIPE_ENABLED=true even if vars absent — runtime gate handles it', () => {
    const result = EnvSchema.parse({ ...BASE, STRIPE_ENABLED: 'true' });
    expect(result.STRIPE_ENABLED).toBe('true');
  });

  it('parses when STRIPE_ENABLED=true with all vars present', () => {
    const result = EnvSchema.parse({
      ...BASE,
      STRIPE_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      STRIPE_PREMIUM_PRICE_ID: 'price_p',
      STRIPE_ELITE_PRICE_ID: 'price_e',
      STRIPE_SUCCESS_URL: 'http://localhost/ok',
      STRIPE_CANCEL_URL: 'http://localhost/cancel',
    });
    expect(result.STRIPE_SECRET_KEY).toBe('sk_test_x');
    expect(result.STRIPE_SUCCESS_URL).toBe('http://localhost/ok');
  });

  it('rejects PHI_ENCRYPTION_KEY with wrong length', () => {
    expect(() => EnvSchema.parse({ ...BASE, PHI_ENCRYPTION_KEY: 'abc' })).toThrow();
  });
});
