import { z } from 'zod';

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  PHI_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  // Stripe — feature-gated. All six vars are required only when STRIPE_ENABLED=true.
  STRIPE_ENABLED: z.enum(['true', 'false']).default('false'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PREMIUM_PRICE_ID: z.string().optional(),
  STRIPE_ELITE_PRICE_ID: z.string().optional(),
  STRIPE_SUCCESS_URL: z.string().url().optional(),
  STRIPE_CANCEL_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
