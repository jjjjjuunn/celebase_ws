import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import { RevenuecatUnavailableError } from '../adapters/revenuecat.adapter.js';
import {
  syncFromRevenuecat,
  type RevenuecatSyncConfig,
} from '../services/revenuecat-sync.service.js';
import type { RevenuecatAdapter } from '../adapters/revenuecat.adapter.js';
import type { UserServiceClient } from '../services/user-service.client.js';

const RefreshFromRevenuecatBodySchema = z
  .object({
    user_id: z.string().uuid(),
    source: z.enum(['purchase', 'app_open', 'manual']),
  })
  .strict();

export interface InternalSubscriptionsRoutesOptions {
  pool: pg.Pool;
  revenuecatConfig: RevenuecatSyncConfig;
  revenuecatAdapter: RevenuecatAdapter;
  userClient: UserServiceClient;
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function internalSubscriptionsRoutes(
  app: FastifyInstance,
  options: InternalSubscriptionsRoutesOptions,
): Promise<void> {
  const { pool, revenuecatConfig, revenuecatAdapter, userClient } = options;

  // POST /internal/subscriptions/refresh-from-revenuecat
  // BFF -> commerce-service pull-sync entry. RevenueCat REST API 직접 조회 -> entitlement
  // -> tier 도출 -> subscriptions upsert + user-service tier sync.
  // Auth: internal JWT (audience = commerce-service:internal), guarded by
  // registerInternalJwtAuth in src/index.ts (root-scope onRequest hook).
  app.post(
    '/internal/subscriptions/refresh-from-revenuecat',
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
      const parsed = RefreshFromRevenuecatBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid request body',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            issue: e.message,
          })),
        );
      }

      const { user_id, source } = parsed.data;

      try {
        const result = await syncFromRevenuecat(
          {
            pool,
            config: revenuecatConfig,
            userClient,
            adapter: revenuecatAdapter,
            log: request.log,
          },
          { userId: user_id, source },
        );
        await reply.status(200).send(result);
      } catch (err) {
        if (err instanceof RevenuecatUnavailableError) {
          await reply.status(502).send({
            error: {
              code: 'REVENUECAT_UNAVAILABLE',
              message: 'RevenueCat REST API unavailable',
              requestId: request.id,
            },
          });
          return;
        }
        throw err;
      }
    },
  );
}
