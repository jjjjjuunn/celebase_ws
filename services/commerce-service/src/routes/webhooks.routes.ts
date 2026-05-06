import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { StripeConfig } from '../services/subscription.service.js';
import type { UserServiceClient } from '../services/user-service.client.js';
import * as subscriptionService from '../services/subscription.service.js';
import * as processedEventsRepo from '../repositories/processed-events.repository.js';

const RevenuecatEventSchema = z.object({
  event: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
  }),
});

function constantTimeBearerEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function webhooksRoutes(
  app: FastifyInstance,
  options: {
    pool: pg.Pool;
    stripeConfig?: StripeConfig | undefined;
    userClient: UserServiceClient;
    commerceWebhookEnabled: boolean;
    revenuecatConfig?: { enabled: boolean; authToken: string } | undefined;
  },
): Promise<void> {
  const { pool, stripeConfig, userClient, commerceWebhookEnabled, revenuecatConfig } = options;

  await app.register((scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: 1_048_576 },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, result?: Buffer) => void) => {
        done(null, body);
      },
    );

    scope.post('/webhooks/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!commerceWebhookEnabled || !stripeConfig) {
        return reply.status(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Webhook endpoint not yet active',
            requestId: request.id,
          },
        });
      }

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

      const payloadHash = createHash('sha256')
        .update(JSON.stringify(event.data.object))
        .digest('hex');

      const { inserted } = await processedEventsRepo.markProcessed(pool, {
        provider: 'stripe',
        eventId: event.id,
        stripeEventId: event.id,
        eventType: event.type,
        payloadHash,
        result: 'applied',
      });

      if (!inserted) {
        request.log.info({
          msg: 'stripe.webhook.replay_skipped',
          stripe_event_id: event.id,
          event_type: event.type,
        });
        return reply.status(200).send({ received: true });
      }

      try {
        await subscriptionService.handleWebhookEvent(pool, event, stripeConfig, userClient);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message.slice(0, 500) : 'unknown error';
        request.log.error({
          msg: 'stripe.webhook.processing_failed',
          stripe_event_id: event.id,
          event_type: event.type,
          error: errMsg,
        });
        try {
          await pool.query(
            `UPDATE processed_events SET result = 'error', error_message = $2
             WHERE stripe_event_id = $1`,
            [event.id, errMsg],
          );
        } catch (updateErr) {
          request.log.error({
            msg: 'stripe.webhook.error_update_failed',
            stripe_event_id: event.id,
            error: updateErr instanceof Error ? updateErr.message : 'unknown',
          });
        }
        return reply.status(500).send({
          error: {
            code: 'WEBHOOK_PROCESSING_FAILED',
            message: 'Webhook processing failed',
            requestId: request.id,
          },
        });
      }

      return reply.status(200).send({ received: true });
    });

    scope.post('/webhooks/revenuecat', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!commerceWebhookEnabled || !revenuecatConfig?.enabled) {
        return reply.status(503).send({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Webhook endpoint not yet active',
            requestId: request.id,
          },
        });
      }

      const authHeader = request.headers['authorization'];
      if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or malformed Authorization header',
            requestId: request.id,
          },
        });
      }
      const provided = authHeader.slice('Bearer '.length);
      if (!constantTimeBearerEqual(provided, revenuecatConfig.authToken)) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid webhook auth token',
            requestId: request.id,
          },
        });
      }

      let body: unknown;
      try {
        body = JSON.parse((request.body as Buffer).toString('utf8'));
      } catch {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid JSON body',
            requestId: request.id,
          },
        });
      }

      const parsed = RevenuecatEventSchema.safeParse(body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid RevenueCat event shape',
            requestId: request.id,
          },
        });
      }

      const event = parsed.data.event;
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(parsed.data.event))
        .digest('hex');

      let inserted: boolean;
      try {
        ({ inserted } = await processedEventsRepo.markProcessed(pool, {
          provider: 'revenuecat',
          eventId: event.id,
          stripeEventId: event.id,
          eventType: event.type,
          payloadHash,
          result: 'applied',
        }));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message.slice(0, 500) : 'unknown error';
        request.log.error({
          msg: 'revenuecat.webhook.dedup_failed',
          revenuecat_event_id: event.id,
          event_type: event.type,
          error: errMsg,
        });
        return reply.status(500).send({
          error: {
            code: 'WEBHOOK_PROCESSING_FAILED',
            message: 'Webhook processing failed',
            requestId: request.id,
          },
        });
      }

      if (!inserted) {
        request.log.info({
          msg: 'revenuecat.webhook.replay_skipped',
          revenuecat_event_id: event.id,
          event_type: event.type,
        });
        return reply.status(200).send({ received: true });
      }

      // Subscription reconciliation is delegated to IMPL-MOBILE-SUB-SYNC-001
      // (refresh-from-revenuecat). Acknowledge after dedup to avoid retries.
      request.log.info({
        msg: 'revenuecat.webhook.received',
        revenuecat_event_id: event.id,
        event_type: event.type,
      });

      return reply.status(200).send({ received: true });
    });
  });
}
