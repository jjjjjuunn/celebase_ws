import { z } from 'zod';

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3005),
    HOST: z.string().min(1).default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    COGNITO_USER_POOL_ID: z.string().min(1),
    COGNITO_APP_CLIENT_ID: z.string().min(1),
    COGNITO_REGION: z.string().min(1).default('us-east-1'),
    JWKS_URI: z.string().url().optional(),
    JWT_ISSUER: z.string().min(1).optional(),
    JWT_AUDIENCE: z.string().min(1).optional(),
    MVIEW_REFRESH_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
    MVIEW_REFRESH_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.JWKS_URI) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWKS_URI is required in production',
          path: ['JWKS_URI'],
        });
      }
      if (!data.JWT_ISSUER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_ISSUER is required in production',
          path: ['JWT_ISSUER'],
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;
