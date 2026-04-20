import { createApp, createPool, EnvPhiKeyProvider, registerJwtAuth } from '@celebbase/service-core';
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
import type { AuthProvider } from './services/auth.service.js';
import { DevAuthProvider } from './services/auth.service.js';
import { CognitoAuthProvider } from './services/cognito-auth.provider.js';

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);
  const phiKeyProvider = new EnvPhiKeyProvider(env.PHI_ENCRYPTION_KEY);
  const redis = createClient({ url: env.REDIS_URL }) as RedisClientType;
  await redis.connect();

  const app = await createApp({ serviceName: 'user-service' });

  registerJwtAuth(app, {
    publicPaths: ['/auth/signup', '/auth/login', '/auth/refresh', '/webhooks/stripe'],
  });

  // Auth routes (public — no JWT required)
  // Prod guards are enforced by EnvSchema.superRefine at startup; these are belt-and-suspenders.
  if (env.NODE_ENV === 'production' && env.AUTH_PROVIDER !== 'cognito') {
    app.log.fatal('AUTH_PROVIDER must be "cognito" in production');
    process.exit(1);
  }
  let authProvider: AuthProvider;
  if (env.AUTH_PROVIDER === 'cognito') {
    // superRefine guarantees these fields are non-empty when AUTH_PROVIDER=cognito.
    if (
      !env.COGNITO_USER_POOL_ID ||
      !env.COGNITO_CLIENT_ID ||
      !env.AWS_REGION ||
      !env.COGNITO_JWKS_URI ||
      !env.COGNITO_ISSUER
    ) {
      app.log.fatal('Cognito config missing after env validation — should not happen');
      process.exit(1);
    }
    authProvider = new CognitoAuthProvider({
      userPoolId: env.COGNITO_USER_POOL_ID,
      clientId: env.COGNITO_CLIENT_ID,
      region: env.AWS_REGION,
      jwksUri: env.COGNITO_JWKS_URI,
      issuer: env.COGNITO_ISSUER,
    });
    app.log.info('Auth provider: cognito');
  } else {
    authProvider = new DevAuthProvider();
    app.log.info('Auth provider: dev');
  }
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
