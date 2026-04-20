import { createApp, createPool, registerJwtAuth } from '@celebbase/service-core';
import Stripe from 'stripe';
import { EnvSchema } from './env.js';

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);

  const app = await createApp({ serviceName: 'commerce-service' });

  registerJwtAuth(app, {
    publicPaths: ['/webhooks/stripe'],
  });

  // Deep readiness probe — verifies all external dependencies are reachable.
  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};

    // DB ping
    try {
      await pool.query('SELECT 1');
      checks['db'] = 'ok';
    } catch {
      checks['db'] = 'fail';
    }

    // Stripe SDK init (only when feature is enabled)
    if (env.STRIPE_ENABLED === 'true') {
      try {
        if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        // Lightweight call — retrieve balance (does not create/mutate anything)
        await stripe.balance.retrieve();
        checks['stripe'] = 'ok';
      } catch {
        checks['stripe'] = 'fail';
      }
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    void reply.status(allOk ? 200 : 503).send({ status: allOk ? 'ready' : 'not_ready', checks });
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error: unknown) {
    app.log.error({ err: error }, 'Failed to start commerce-service');
    await pool.end();
    await app.close();
    process.exitCode = 1;
  }
};

void start();
