import { createApp, createPool, EnvPhiKeyProvider } from '@celebbase/service-core';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import Stripe from 'stripe';
import { EnvSchema } from './env.js';
import { userRoutes } from './routes/user.routes.js';
import { bioProfileRoutes } from './routes/bio-profile.routes.js';
import { wsTicketRoutes } from './routes/ws-ticket.routes.js';
import { dailyLogRoutes } from './routes/daily-log.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { subscriptionRoutes } from './routes/subscription.routes.js';
import { DevAuthProvider } from './services/auth.service.js';

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

  // Stripe feature gate — /subscriptions/* only registers when STRIPE_ENABLED=true.
  if (env.STRIPE_ENABLED === 'true') {
    if (
      !env.STRIPE_SECRET_KEY ||
      !env.STRIPE_WEBHOOK_SECRET ||
      !env.STRIPE_PREMIUM_PRICE_ID ||
      !env.STRIPE_ELITE_PRICE_ID ||
      !env.STRIPE_SUCCESS_URL ||
      !env.STRIPE_CANCEL_URL
    ) {
      const missing = [
        !env.STRIPE_SECRET_KEY && 'STRIPE_SECRET_KEY',
        !env.STRIPE_WEBHOOK_SECRET && 'STRIPE_WEBHOOK_SECRET',
        !env.STRIPE_PREMIUM_PRICE_ID && 'STRIPE_PREMIUM_PRICE_ID',
        !env.STRIPE_ELITE_PRICE_ID && 'STRIPE_ELITE_PRICE_ID',
        !env.STRIPE_SUCCESS_URL && 'STRIPE_SUCCESS_URL',
        !env.STRIPE_CANCEL_URL && 'STRIPE_CANCEL_URL',
      ].filter(Boolean);
      app.log.fatal({ missing }, 'STRIPE_ENABLED=true but required Stripe env vars are missing');
      process.exit(1);
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    await app.register(subscriptionRoutes, {
      pool,
      stripeConfig: {
        stripe,
        premiumPriceId: env.STRIPE_PREMIUM_PRICE_ID,
        elitePriceId: env.STRIPE_ELITE_PRICE_ID,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        successUrl: env.STRIPE_SUCCESS_URL,
        cancelUrl: env.STRIPE_CANCEL_URL,
      },
    });
    app.log.info('Stripe subscriptions enabled');
  } else {
    app.log.warn('Stripe subscriptions disabled (STRIPE_ENABLED=false)');
  }

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
