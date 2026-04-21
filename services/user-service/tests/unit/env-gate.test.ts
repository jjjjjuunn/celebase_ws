import { describe, it, expect } from '@jest/globals';
import { EnvSchema } from '../../src/env.js';

const BASE = {
  DATABASE_URL: 'postgresql://x',
  PHI_ENCRYPTION_KEY: '0'.repeat(64),
  NODE_ENV: 'test',
};

describe('EnvSchema', () => {
  it('rejects PHI_ENCRYPTION_KEY with wrong length', () => {
    expect(() => EnvSchema.parse({ ...BASE, PHI_ENCRYPTION_KEY: 'abc' })).toThrow();
  });

  it('defaults COMMERCE_SERVICE_URL to localhost:3004', () => {
    const result = EnvSchema.parse(BASE);
    expect(result.COMMERCE_SERVICE_URL).toBe('http://localhost:3004');
  });

  it('accepts custom COMMERCE_SERVICE_URL', () => {
    const result = EnvSchema.parse({ ...BASE, COMMERCE_SERVICE_URL: 'http://commerce:3004' });
    expect(result.COMMERCE_SERVICE_URL).toBe('http://commerce:3004');
  });
});
