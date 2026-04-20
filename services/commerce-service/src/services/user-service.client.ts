import { createInternalClient } from '@celebbase/service-core';

export interface UserServiceClient {
  syncTier(
    userId: string,
    tier: 'free' | 'premium' | 'elite',
    opts: { idempotencyKey: string },
  ): Promise<void>;
}

export function createUserServiceClient(env: {
  USER_SERVICE_URL: string;
  INTERNAL_JWT_SECRET: string;
}): UserServiceClient {
  const client = createInternalClient({
    baseUrl: env.USER_SERVICE_URL,
    secret: env.INTERNAL_JWT_SECRET,
    issuer: 'celebbase-internal',
    audience: 'user-service:internal',
    timeoutMs: 3000,
    retries: 2,
  });

  return {
    async syncTier(userId, tier, opts): Promise<void> {
      await client.post(
        `/internal/users/${userId}/tier`,
        { tier },
        { idempotencyKey: opts.idempotencyKey },
      );
    },
  };
}
