import { createApp, createPool, EnvPhiKeyProvider, registerJwtAuth } from '@celebbase/service-core';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

import { EnvSchema } from './env.js';
import { userRoutes } from './routes/user.routes.js';
import { bioProfileRoutes } from './routes/bio-profile.routes.js';
import { wsTicketRoutes } from './routes/ws-ticket.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { subscriptionRoutes } from './routes/subscription.routes.js';
import { internalRoutes } from './routes/internal.routes.js';
import { registerInternalJwtAuth } from './middleware/internal-jwt.js';
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

  // External JWT guard — skips /internal/* (protected by internal JWT guard instead)
  registerJwtAuth(app, {
    publicPaths: ['/auth/signup', '/auth/login', '/auth/refresh', '/internal/*'],
  });

  // Internal JWT guard — strict iss/aud/jti validation for /internal/* routes
  registerInternalJwtAuth(app);

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
      ...(env.COGNITO_MOBILE_CLIENT_ID
        ? { mobileClientId: env.COGNITO_MOBILE_CLIENT_ID }
        : {}),
      region: env.AWS_REGION,
      jwksUri: env.COGNITO_JWKS_URI,
      issuer: env.COGNITO_ISSUER,
      log: app.log,
    });
    app.log.info('Auth provider: cognito');
    if (env.COGNITO_MOBILE_CLIENT_ID) {
      app.log.info('Cognito mobile audience enabled');
    }
  } else {
    authProvider = new DevAuthProvider();
    app.log.info('Auth provider: dev');
  }
  await app.register(authRoutes, {
    pool,
    authProvider,
    rateLimits: {
      signup: env.AUTH_RATE_LIMIT_SIGNUP,
      login: env.AUTH_RATE_LIMIT_LOGIN,
      refresh: env.AUTH_RATE_LIMIT_REFRESH,
      logout: env.AUTH_RATE_LIMIT_LOGOUT,
    },
  });

  await app.register(userRoutes, { pool });
  await app.register(bioProfileRoutes, { pool, phiKeyProvider });
  await app.register(wsTicketRoutes, { redis });
  await app.register(internalRoutes, { pool });

  // Slim subscription routes (Stripe removed)
  await app.register(subscriptionRoutes, { pool });

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
