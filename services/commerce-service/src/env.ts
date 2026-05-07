import { z } from 'zod';

const STRIPE_API_VERSION = '2025-02-24.acacia';

export const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    HOST: z.string().min(1).default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Feature gates
    STRIPE_ENABLED: z.enum(['true', 'false']).default('false'),
    COMMERCE_WEBHOOK_ENABLED: z.enum(['true', 'false']).default('false'),
    REVENUECAT_ENABLED: z.enum(['true', 'false']).default('false'),

    // RevenueCat — required only when REVENUECAT_ENABLED=true
    REVENUECAT_WEBHOOK_AUTH_TOKEN: z.string().optional(),

    // Stripe — required only when STRIPE_ENABLED=true
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    STRIPE_PREMIUM_PRICE_ID: z.string().optional(),
    STRIPE_ELITE_PRICE_ID: z.string().optional(),
    STRIPE_SUCCESS_URL: z.string().url().optional(),
    STRIPE_CANCEL_URL: z.string().url().optional(),
    // Pin to prevent accidental drift; upgrade is a separate chore (CHORE-014)
    STRIPE_API_VERSION: z.string().default(STRIPE_API_VERSION),

    // Instacart
    INSTACART_API_KEY: z.string().optional(),
    INSTACART_OAUTH_CLIENT_SECRET: z.string().optional(),
    INSTACART_BASE_URL: z.string().url().default('https://connect.instacart.com'),

    // Amazon Fresh fallback affiliate tag
    AMAZON_FRESH_AFFILIATE_TAG: z.string().optional(),

    // Internal service communication
    INTERNAL_JWT_SECRET: z.string().optional(),
    USER_SERVICE_URL: z.string().url().default('http://localhost:3001'),

    // Cognito JWKS for external JWT verification
    JWKS_URI: z.string().optional(),
    JWT_ISSUER: z.string().optional(),
    JWT_AUDIENCE: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const DEFAULT_SECRET = 'dev-secret-not-for-prod';

    if (env.NODE_ENV === 'production') {
      if (!env.INTERNAL_JWT_SECRET || env.INTERNAL_JWT_SECRET === DEFAULT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'INTERNAL_JWT_SECRET must be set to a non-default value in production',
          path: ['INTERNAL_JWT_SECRET'],
        });
      }
      if (!env.JWKS_URI || !env.JWT_ISSUER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWKS_URI and JWT_ISSUER are required in production',
          path: ['JWKS_URI'],
        });
      }
    }

    if (env.STRIPE_ENABLED === 'true') {
      const required = [
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_PREMIUM_PRICE_ID',
        'STRIPE_ELITE_PRICE_ID',
        'STRIPE_SUCCESS_URL',
        'STRIPE_CANCEL_URL',
      ] as const;
      for (const field of required) {
        if (!env[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} is required when STRIPE_ENABLED=true`,
            path: [field],
          });
        }
      }
    }

    if (env.REVENUECAT_ENABLED === 'true') {
      if (!env.REVENUECAT_WEBHOOK_AUTH_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'REVENUECAT_WEBHOOK_AUTH_TOKEN is required when REVENUECAT_ENABLED=true',
          path: ['REVENUECAT_WEBHOOK_AUTH_TOKEN'],
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;
