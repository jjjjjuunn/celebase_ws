import { createApp, createPool, EnvPhiKeyProvider } from '@celebbase/service-core';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { z } from 'zod';
import { userRoutes } from './routes/user.routes.js';
import { bioProfileRoutes } from './routes/bio-profile.routes.js';
import { wsTicketRoutes } from './routes/ws-ticket.routes.js';
import { dailyLogRoutes } from './routes/daily-log.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { DevAuthProvider } from './services/auth.service.js';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  PHI_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
});

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);
  const phiKeyProvider = new EnvPhiKeyProvider(env.PHI_ENCRYPTION_KEY);
  const redis = createClient({ url: env.REDIS_URL }) as RedisClientType;
  await redis.connect();

  const app = await createApp({ serviceName: 'user-service' });

  // Auth routes (public — no JWT required)
  if (env.NODE_ENV === 'production' && !env.COGNITO_CLIENT_ID) {
    app.log.warn('COGNITO_CLIENT_ID not set in production — using DevAuthProvider as fallback. Configure CognitoAuthProvider for production use.');
  }
  if (env.NODE_ENV === 'production' && (!env.JWT_SECRET || env.JWT_SECRET === 'dev-secret-not-for-prod')) {
    app.log.fatal('JWT_SECRET must be set to a non-default value in production');
    process.exit(1);
  }
  const authProvider = new DevAuthProvider();
  await app.register(authRoutes, { pool, authProvider });

  await app.register(userRoutes, { pool });
  await app.register(bioProfileRoutes, { pool, phiKeyProvider });
  await app.register(wsTicketRoutes, { redis });
  await app.register(dailyLogRoutes, { pool });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error: unknown) {
    app.log.error({ err: error }, 'Failed to start user-service');
    await redis.quit();
    await pool.end();
    await app.close();
    process.exitCode = 1;
  }
};

void start();
