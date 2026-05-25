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
import { jwksRoutes } from './routes/jwks.routes.js';
import { registerInternalJwtAuth } from './middleware/internal-jwt.js';
import type { AuthProvider } from './services/auth.service.js';
import { DevAuthProvider } from './services/auth.service.js';
import { CognitoAuthProvider } from './services/cognito-auth.provider.js';
import {
  AppleAuthProvider,
  GoogleAuthProvider,
  parseGoogleClientIds,
} from './services/social-auth.provider.js';
import { appleOAuthConfigFromEnv, createAppleOAuthClient } from './services/apple-oauth.js';
import { createAvatarUploader, type AvatarUploader } from './services/avatar.service.js';

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);
  const phiKeyProvider = new EnvPhiKeyProvider(env.PHI_ENCRYPTION_KEY);
  const redis = createClient({ url: env.REDIS_URL }) as RedisClientType;
  await redis.connect();

  const app = await createApp({ serviceName: 'user-service' });

  // External JWT guard — skips /internal/* (protected by internal JWT guard instead).
  // /auth/logout is public from the framework's POV: handler self-verifies the
  // refresh_token in body. This is required for the per-route limiter to run
  // BEFORE crypto verify (spec §9.3 — invalid-token DoS protection). If we
  // mounted it inside the JWT guard, the root-scope onRequest hook would run
  // before the plugin-scope rate-limit hook and verify junk tokens on every
  // request without incrementing the bucket.
  registerJwtAuth(app, {
    // Internal HS256 token (issued by this service) is what the BFF forwards.
    // CHORE-MOBILE-AUTH-TOKEN-STRATEGY-001 — verify it directly instead of
    // JWKS/stub. Replaces the staging compose `JWKS_URI: ""` stub workaround.
    mode: 'internal',
    publicPaths: [
      '/auth/signup',
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/internal/*',
      // RS256 public key — public by contract (CHORE-AUTH-ASYMMETRIC-SIGNING-001).
      '/.well-known/jwks.json',
    ],
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

  // Native social verifiers (IMPL-MOBILE-SOCIAL-NATIVE-001). Wired only when
  // their env is present + valid (env.ts validated GOOGLE_CLIENT_IDS format at
  // boot). Unwired providers stay absent → /auth/login fails closed with
  // SOCIAL_PROVIDER_NOT_CONFIGURED. Independent of AUTH_PROVIDER.
  const socialProviders: Partial<Record<'apple' | 'google', AuthProvider>> = {};
  if (env.APPLE_BUNDLE_ID) {
    socialProviders.apple = new AppleAuthProvider({
      bundleId: env.APPLE_BUNDLE_ID,
      log: app.log,
    });
    app.log.info('Social provider: apple (native)');
  }
  const googleClientIds = parseGoogleClientIds(env.GOOGLE_CLIENT_IDS);
  if (googleClientIds) {
    socialProviders.google = new GoogleAuthProvider({
      allowedClientIds: googleClientIds,
      log: app.log,
    });
    app.log.info('Social provider: google (native)');
  }

  // Apple token revocation client (FEAT-APPLE-REVOKE-001). Null unless the
  // APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY trio + APPLE_BUNDLE_ID are all set (env.ts
  // boot guard). When null, exchange/revoke are skipped (deletion soft-deletes).
  const appleOAuth = createAppleOAuthClient(appleOAuthConfigFromEnv(env));
  if (appleOAuth) {
    app.log.info('Apple token revocation: enabled');
  }

  await app.register(authRoutes, {
    pool,
    authProvider,
    socialProviders,
    appleOAuth,
    phiKeyProvider,
    rateLimits: {
      signup: env.AUTH_RATE_LIMIT_SIGNUP,
      login: env.AUTH_RATE_LIMIT_LOGIN,
      refresh: env.AUTH_RATE_LIMIT_REFRESH,
      logout: env.AUTH_RATE_LIMIT_LOGOUT,
    },
  });

  // Avatar uploads (FEAT-PROFILE-EDIT). Wired only when AVATARS_BUCKET is set
  // (env.ts guarantees AWS_REGION + AVATARS_PUBLIC_BASE_URL are present too).
  // Unwired → the upload-url route fails closed with 503.
  let avatarUploader: AvatarUploader | null = null;
  if (env.AVATARS_BUCKET && env.AWS_REGION && env.AVATARS_PUBLIC_BASE_URL) {
    avatarUploader = createAvatarUploader({
      bucket: env.AVATARS_BUCKET,
      region: env.AWS_REGION,
      publicBaseUrl: env.AVATARS_PUBLIC_BASE_URL,
      maxBytes: env.AVATAR_MAX_BYTES,
      ttlSeconds: env.AVATAR_UPLOAD_URL_TTL,
    });
    app.log.info('Avatar uploads: enabled');
  }

  await app.register(userRoutes, { pool, appleOAuth, phiKeyProvider, avatarUploader });
  await app.register(bioProfileRoutes, { pool, phiKeyProvider });
  await app.register(wsTicketRoutes, { redis });
  await app.register(internalRoutes, { pool });
  jwksRoutes(app);

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
