import { createApp, createPool, registerJwtAuth } from '@celebbase/service-core';
import Stripe from 'stripe';
import { EnvSchema } from './env.js';
import type { StripeConfig } from './services/subscription.service.js';
import { createUserServiceClient } from './services/user-service.client.js';
import { webhooksRoutes } from './routes/webhooks.routes.js';
import { RevenuecatAdapter } from './adapters/revenuecat.adapter.js';
import type { RevenuecatSyncConfig } from './services/revenuecat-sync.service.js';

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);

  const app = await createApp({ serviceName: 'commerce-service' });

  registerJwtAuth(app, {
    publicPaths: ['/webhooks/stripe', '/webhooks/revenuecat'],
  });

  // Build StripeConfig only when feature is enabled — superRefine guarantees fields are present.
  let stripeConfig: StripeConfig | undefined;
  if (env.STRIPE_ENABLED === 'true') {
    stripeConfig = {
      stripe: new Stripe(env.STRIPE_SECRET_KEY as string),
      premiumPriceId: env.STRIPE_PREMIUM_PRICE_ID as string,
      elitePriceId: env.STRIPE_ELITE_PRICE_ID as string,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET as string,
      successUrl: env.STRIPE_SUCCESS_URL as string,
      cancelUrl: env.STRIPE_CANCEL_URL as string,
    };
  }

  const userClient = createUserServiceClient({
    USER_SERVICE_URL: env.USER_SERVICE_URL,
    INTERNAL_JWT_SECRET: env.INTERNAL_JWT_SECRET ?? 'dev-secret-not-for-prod',
  });

  // Build RevenueCat sync config + adapter only when feature is enabled.
  // superRefine in env.ts guarantees fields are present + JSON parses to a valid product->tier map.
  let revenuecatConfig: (RevenuecatSyncConfig & { authToken: string }) | undefined;
  let revenuecatAdapter: RevenuecatAdapter | undefined;
  if (env.REVENUECAT_ENABLED === 'true') {
    const productTierMap = JSON.parse(
      env.REVENUECAT_PRODUCT_TIER_MAP_JSON as string,
    ) as Record<string, 'premium' | 'elite'>;
    revenuecatConfig = {
      enabled: true,
      authToken: env.REVENUECAT_WEBHOOK_AUTH_TOKEN as string,
      apiKey: env.REVENUECAT_API_KEY as string,
      apiBaseUrl: env.REVENUECAT_API_BASE_URL,
      productTierMap,
    };
    revenuecatAdapter = new RevenuecatAdapter({
      apiKey: revenuecatConfig.apiKey,
      baseUrl: revenuecatConfig.apiBaseUrl,
    });
  }

  await app.register(webhooksRoutes, {
    pool,
    ...(stripeConfig !== undefined ? { stripeConfig } : {}),
    userClient,
    commerceWebhookEnabled: env.COMMERCE_WEBHOOK_ENABLED === 'true',
    ...(revenuecatConfig !== undefined ? { revenuecatConfig } : {}),
    ...(revenuecatAdapter !== undefined ? { revenuecatAdapter } : {}),
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
