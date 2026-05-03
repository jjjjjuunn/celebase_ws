import { createApp, createPool, registerJwtAuth } from '@celebbase/service-core';
import { z } from 'zod';
import { celebrityRoutes } from './routes/celebrity.routes.js';
import { baseDietRoutes } from './routes/baseDiet.routes.js';
import { recipeRoutes } from './routes/recipe.routes.js';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
});

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);
  const app = await createApp({ serviceName: 'content-service' });

  registerJwtAuth(app);

  await app.register(celebrityRoutes, { pool });
  await app.register(baseDietRoutes, { pool });
  await app.register(recipeRoutes, { pool });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error: unknown) {
    app.log.error({ err: error }, 'Failed to start content-service');
    await pool.end();
    await app.close();
    process.exitCode = 1;
  }
};

void start();
