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
});

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);
  const phiKeyProvider = new EnvPhiKeyProvider(env.PHI_ENCRYPTION_KEY);
  const redis = createClient({ url: env.REDIS_URL }) as RedisClientType;
  await redis.connect();

  const app = await createApp({ serviceName: 'user-service' });

  // Auth routes (public — no JWT required)
  const authProvider = new DevAuthProvider(); // TODO: swap with CognitoAuthProvider when COGNITO_CLIENT_ID is set
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
