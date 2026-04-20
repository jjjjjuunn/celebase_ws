import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import type { StripeConfig } from '../services/subscription.service.js';
import * as subscriptionService from '../services/subscription.service.js';

const CreateSubscriptionSchema = z.object({
  tier: z.enum(['premium', 'elite']),
}).strict();

 
export async function subscriptionRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool; stripeConfig: StripeConfig },
): Promise<void> {
  const { pool, stripeConfig } = options;

  // POST /subscriptions — create Stripe Checkout Session
  app.post('/subscriptions', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CreateSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }

    const result = await subscriptionService.createCheckoutSession(
      pool,
      stripeConfig,
      request.userId,
      parsed.data.tier,
    );
    return reply.status(201).send(result);
  });

  // GET /subscriptions/me — current user's subscription
  app.get('/subscriptions/me', async (request: FastifyRequest) => {
    const sub = await subscriptionService.getMySubscription(pool, request.userId);
    if (!sub) {
      return { tier: 'free' as const, status: null, cancel_at_period_end: false };
    }
    return sub;
  });

  // POST /subscriptions/me/cancel — request cancellation at period end
  app.post('/subscriptions/me/cancel', async (request: FastifyRequest) => {
    return subscriptionService.cancelSubscription(pool, stripeConfig, request.userId);
  });

  // POST /webhooks/stripe — Stripe webhook receiver (PUBLIC, no JWT)
  // Scoped content-type parser to preserve raw body for signature verification
  await app.register((scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, result?: Buffer) => void) => {
        done(null, body);
      },
    );

    scope.post('/webhooks/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        return reply.status(400).send({
          error: {
            code: 'MISSING_SIGNATURE',
            message: 'stripe-signature header required',
            requestId: request.id,
          },
        });
      }

      let event;
      try {
        event = stripeConfig.stripe.webhooks.constructEvent(
          request.body as Buffer,
          sig,
          stripeConfig.webhookSecret,
        );
      } catch {
        return reply.status(400).send({
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Webhook signature verification failed',
            requestId: request.id,
          },
        });
      }

      await subscriptionService.handleWebhookEvent(pool, event, stripeConfig);
      return reply.status(200).send({ received: true });
    });
  });
}
