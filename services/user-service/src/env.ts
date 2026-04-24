import { z } from 'zod';
import { DEV_INTERNAL_JWT_SECRET } from './services/auth.service.js';

const COGNITO_JWKS_PATTERN =
  /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\//;
const COGNITO_ISSUER_PATTERN =
  /^https:\/\/cognito-idp\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9-]+_[A-Za-z0-9]+$/;

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
    COGNITO_ISSUER: z
      .string()
      .regex(COGNITO_ISSUER_PATTERN, 'Must be a Cognito Issuer URL without trailing slash')
      .optional(),
    COGNITO_LIVE_JWKS: z.enum(['1', 'true']).optional(),
    COGNITO_ENVIRONMENT: z.string().optional(),

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

      // JWKS_URI === ISSUER + '/.well-known/jwks.json' cross-check
      if (
        env.COGNITO_JWKS_URI &&
        env.COGNITO_ISSUER &&
        env.COGNITO_JWKS_URI !== `${env.COGNITO_ISSUER}/.well-known/jwks.json`
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'COGNITO_JWKS_URI must equal COGNITO_ISSUER + "/.well-known/jwks.json"',
          path: ['COGNITO_JWKS_URI'],
        });
      }
    }

    // internal secret guard: must not be default value in production; min 32 chars
    const secret = env.INTERNAL_JWT_SECRET ?? DEV_INTERNAL_JWT_SECRET;
    if (env.NODE_ENV === 'production') {
      if (secret === DEV_INTERNAL_JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'INTERNAL_JWT_SECRET must be set to a non-default value in production',
          path: ['INTERNAL_JWT_SECRET'],
        });
      }
      if (!env.INTERNAL_JWT_SECRET || env.INTERNAL_JWT_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'INTERNAL_JWT_SECRET must be at least 32 characters in production',
          path: ['INTERNAL_JWT_SECRET'],
        });
      }
    }

    // COGNITO_LIVE_JWKS staging guard
    if (env.COGNITO_LIVE_JWKS) {
      if (env.COGNITO_ENVIRONMENT !== 'staging') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'COGNITO_ENVIRONMENT must be exactly "staging" when COGNITO_LIVE_JWKS is set (prod pool guard)',
          path: ['COGNITO_ENVIRONMENT'],
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;
