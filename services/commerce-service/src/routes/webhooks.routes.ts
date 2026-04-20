import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import type { StripeConfig } from '../services/subscription.service.js';
import type { UserServiceClient } from '../services/user-service.client.js';
import * as subscriptionService from '../services/subscription.service.js';
import * as processedEventsRepo from '../repositories/processed-events.repository.js';

export async function webhooksRoutes(
  app: FastifyInstance,
  options: {
    pool: pg.Pool;
    stripeConfig: StripeConfig;
    userClient: UserServiceClient;
    commerceWebhookEnabled: boolean;
  },
): Promise<void> {
  const { pool, stripeConfig, userClient, commerceWebhookEnabled } = options;

  await app.register((scope) => {
    scope.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: 1_048_576 },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, result?: Buffer) => void) => {
        done(null, body);
      },
    );

    scope.post('/webhooks/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!commerceWebhookEnabled) {
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
  });
}
