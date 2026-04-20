import { z } from 'zod';

const COGNITO_JWKS_PATTERN =
  /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\//;

export const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().min(1).default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    PHI_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),

    // Commerce service URL — used by slim subscription routes to redirect if needed
    COMMERCE_SERVICE_URL: z.string().url().default('http://localhost:3004'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    AUTH_PROVIDER: z.enum(['dev', 'cognito']).default('dev'),

    // Internal JWT — issued by user-service, verified by BFF + meal-plan-engine
    INTERNAL_JWT_SECRET: z.string().optional(),
    INTERNAL_JWT_ISSUER: z.string().default('celebbase-user-service'),

    // AWS Cognito — required only when AUTH_PROVIDER=cognito
    AWS_REGION: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    COGNITO_JWKS_URI: z
      .string()
      .regex(COGNITO_JWKS_PATTERN, 'Must be a Cognito JWKS URI')
      .optional(),
    COGNITO_ISSUER: z.string().optional(),

  })
  .superRefine((env, ctx) => {
    // prod guard: AUTH_PROVIDER must be cognito in production
    if (env.NODE_ENV === 'production' && env.AUTH_PROVIDER !== 'cognito') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AUTH_PROVIDER must be "cognito" in production',
        path: ['AUTH_PROVIDER'],
      });
    }

    // cognito guard: all Cognito vars must be non-empty when AUTH_PROVIDER=cognito
    if (env.AUTH_PROVIDER === 'cognito') {
      const required: Array<keyof typeof env> = [
        'AWS_REGION',
        'COGNITO_USER_POOL_ID',
        'COGNITO_CLIENT_ID',
        'COGNITO_JWKS_URI',
        'COGNITO_ISSUER',
      ];
      for (const field of required) {
        if (!env[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} is required when AUTH_PROVIDER=cognito`,
            path: [field],
          });
        }
      }
    }

    // internal secret guard: must not be default value in production
    const DEFAULT_SECRET = 'dev-secret-not-for-prod';
    const secret = env.INTERNAL_JWT_SECRET ?? DEFAULT_SECRET;
    if (env.NODE_ENV === 'production' && secret === DEFAULT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'INTERNAL_JWT_SECRET must be set to a non-default value in production',
        path: ['INTERNAL_JWT_SECRET'],
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;
