import { createApp, createPool, registerJwtAuth } from '@celebbase/service-core';
import { EnvSchema } from './env.js';
import { dailyLogRoutes } from './routes/daily-log.routes.js';
import { startMviewRefreshScheduler } from './lib/mview-refresh.scheduler.js';

const PUBLIC_PATHS = ['/health', '/ready', '/docs', '/docs/json'] as const;

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);
  const app = await createApp({ serviceName: 'analytics-service' });

  registerJwtAuth(app, { publicPaths: [...PUBLIC_PATHS] });

  await app.register(dailyLogRoutes, { pool });

  app.get('/health', async (_request, reply) => {
    void reply.status(200).send({ status: 'ok' });
  });

  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    try {
      await pool.query('SELECT 1');
      checks['db'] = 'ok';
    } catch {
      checks['db'] = 'fail';
    }
    const allOk = Object.values(checks).every((v) => v === 'ok');
    void reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'not_ready',
      checks,
    });
  });

  const stopScheduler = startMviewRefreshScheduler(
    pool,
    app.log,
    env.MVIEW_REFRESH_INTERVAL_MINUTES,
    env.MVIEW_REFRESH_ENABLED,
  );

  const cleanup = async (): Promise<void> => {
    stopScheduler();
    await app.close();
    await pool.end();
  };

  process.once('SIGTERM', () => void cleanup());
  process.once('SIGINT', () => void cleanup());

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error: unknown) {
    app.log.error({ err: error }, 'Failed to start analytics-service');
    stopScheduler();
    await pool.end();
    await app.close();
    process.exitCode = 1;
  }
};

void start();
