import { z } from 'zod';

/**
 * Base config shared across all services.
 * Service-specific fields (DB URL, PORT) should be defined
 * in each service's own config via BaseConfigSchema.extend().
 */
export const BaseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:8000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  // Sentry DSN. Empty string (docker-compose `${SENTRY_DSN:-}` when the host var
  // is unset) must coerce to undefined: `.optional()` only skips `undefined`, so a
  // bare `''` would fail `.url()` and crash createApp at boot. Empty/unset = dormant.
  SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
});
export type BaseConfig = z.infer<typeof BaseConfigSchema>;
