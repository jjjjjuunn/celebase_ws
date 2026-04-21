import { describe, it, expect } from '@jest/globals';
import { EnvSchema } from '../../src/env.js';

const BASE = {
  DATABASE_URL: 'postgresql://x',
  PHI_ENCRYPTION_KEY: '0'.repeat(64),
  NODE_ENV: 'test',
};

const COGNITO_VALID = {
  AUTH_PROVIDER: 'cognito',
  AWS_REGION: 'us-west-2',
  COGNITO_USER_POOL_ID: 'us-west-2_ABCDEF123',
  COGNITO_CLIENT_ID: 'clientid',
  COGNITO_ISSUER:
    'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABCDEF123',
  COGNITO_JWKS_URI:
    'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABCDEF123/.well-known/jwks.json',
};

describe('EnvSchema base validation', () => {
  it('parses BASE with all defaults', () => {
    const result = EnvSchema.parse(BASE);
    expect(result.AUTH_PROVIDER).toBe('dev');
    expect(result.NODE_ENV).toBe('test');
    expect(result.PORT).toBe(3001);
  });

  it('rejects PHI_ENCRYPTION_KEY with wrong length', () => {
    expect(() => EnvSchema.parse({ ...BASE, PHI_ENCRYPTION_KEY: 'abc' })).toThrow();
  });
});

describe('EnvSchema COMMERCE_SERVICE_URL', () => {
  it('defaults COMMERCE_SERVICE_URL to localhost:3004', () => {
    const result = EnvSchema.parse(BASE);
    expect(result.COMMERCE_SERVICE_URL).toBe('http://localhost:3004');
  });

  it('accepts custom COMMERCE_SERVICE_URL', () => {
    const result = EnvSchema.parse({ ...BASE, COMMERCE_SERVICE_URL: 'http://commerce:3004' });
    expect(result.COMMERCE_SERVICE_URL).toBe('http://commerce:3004');
  });
});

describe('EnvSchema COGNITO superRefine matrix', () => {
  it('parses correctly in dev mode without Cognito vars', () => {
    const result = EnvSchema.parse(BASE);
    expect(result.AUTH_PROVIDER).toBe('dev');
    expect(result.COGNITO_LIVE_JWKS).toBeUndefined();
  });

  it('parses correctly with AUTH_PROVIDER=cognito and all required vars', () => {
    const result = EnvSchema.parse({ ...BASE, ...COGNITO_VALID });
    expect(result.AUTH_PROVIDER).toBe('cognito');
    expect(result.COGNITO_ISSUER).toBe(
      'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABCDEF123',
    );
  });

  it('rejects COGNITO_ISSUER without https Cognito prefix', () => {
    expect(() =>
      EnvSchema.parse({
        ...BASE,
        ...COGNITO_VALID,
        COGNITO_ISSUER: 'http://127.0.0.1:9000/mock-pool',
      }),
    ).toThrow();
  });

  it('rejects COGNITO_ISSUER with trailing slash', () => {
    expect(() =>
      EnvSchema.parse({
        ...BASE,
        ...COGNITO_VALID,
        COGNITO_ISSUER:
          'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABCDEF123/',
        COGNITO_JWKS_URI:
          'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABCDEF123//.well-known/jwks.json',
      }),
    ).toThrow();
  });

  it('rejects JWKS_URI that does not equal ISSUER + /.well-known/jwks.json', () => {
    expect(() =>
      EnvSchema.parse({
        ...BASE,
        ...COGNITO_VALID,
        COGNITO_JWKS_URI:
          'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_ABCDEF123/.well-known/WRONG.json',
      }),
    ).toThrow();
  });

  it('accepts COGNITO_LIVE_JWKS=1 with COGNITO_ENVIRONMENT=staging', () => {
    const result = EnvSchema.parse({
      ...BASE,
      ...COGNITO_VALID,
      COGNITO_LIVE_JWKS: '1',
      COGNITO_ENVIRONMENT: 'staging',
    });
    expect(result.COGNITO_LIVE_JWKS).toBe('1');
    expect(result.COGNITO_ENVIRONMENT).toBe('staging');
  });

  it('rejects COGNITO_LIVE_JWKS without COGNITO_ENVIRONMENT=staging', () => {
    expect(() =>
      EnvSchema.parse({
        ...BASE,
        ...COGNITO_VALID,
        COGNITO_LIVE_JWKS: '1',
        COGNITO_ENVIRONMENT: 'prod',
      }),
    ).toThrow();
  });

  it('rejects COGNITO_LIVE_JWKS without any COGNITO_ENVIRONMENT', () => {
    expect(() =>
      EnvSchema.parse({
        ...BASE,
        ...COGNITO_VALID,
        COGNITO_LIVE_JWKS: '1',
      }),
    ).toThrow();
  });

  it('rejects INTERNAL_JWT_SECRET shorter than 32 chars in production', () => {
    expect(() =>
      EnvSchema.parse({
        ...BASE,
        ...COGNITO_VALID,
        NODE_ENV: 'production',
        INTERNAL_JWT_SECRET: 'short',
      }),
    ).toThrow();
  });

  it('rejects default DEV_INTERNAL_JWT_SECRET in production', () => {
    expect(() =>
      EnvSchema.parse({
        ...BASE,
        ...COGNITO_VALID,
        NODE_ENV: 'production',
        INTERNAL_JWT_SECRET: 'dev-internal-secret-32-chars-pad',
      }),
    ).toThrow();
  });

  it('accepts INTERNAL_JWT_SECRET >= 32 chars non-default in production', () => {
    const result = EnvSchema.parse({
      ...BASE,
      ...COGNITO_VALID,
      NODE_ENV: 'production',
      INTERNAL_JWT_SECRET: 'a'.repeat(32),
    });
    expect(result.INTERNAL_JWT_SECRET).toBe('a'.repeat(32));
  });
});
