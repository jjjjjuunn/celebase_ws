import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import type { StripeConfig } from '../services/subscription.service.js';
import * as subscriptionService from '../services/subscription.service.js';

const CreateCheckoutSchema = z
  .object({
    tier: z.enum(['premium', 'elite']),
  })
  .strict();

export async function checkoutRoutes(
  app: FastifyInstance,
  options: {
    pool: pg.Pool;
    stripeConfig: StripeConfig;
    stripeEnabled: boolean;
  },
): Promise<void> {
  const { pool, stripeConfig, stripeEnabled } = options;

  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: 5,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) => request.ip,
    });

    scope.post('/checkout/session', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!stripeEnabled) {
        return reply.status(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Checkout not yet active',
            requestId: request.id,
          },
        });
      }

      const parsed = CreateCheckoutSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid input',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            issue: e.message,
          })),
        );
      }

      const idempotencyKey = createHash('sha256')
        .update(`${request.userId}:${parsed.data.tier}:${String(Math.floor(Date.now() / 60_000))}`)
        .digest('hex');

      const result = await subscriptionService.createCheckoutSession(
        pool,
        stripeConfig,
        request.userId,
        parsed.data.tier,
        idempotencyKey,
      );

      return reply.status(201).send(result);
    });
  });
}
