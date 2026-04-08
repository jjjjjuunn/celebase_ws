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
});
export type BaseConfig = z.infer<typeof BaseConfigSchema>;
