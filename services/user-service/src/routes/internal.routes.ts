import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import * as tierSyncService from '../services/tier-sync.service.js';

const UpdateTierBodySchema = z
  .object({ tier: z.enum(['free', 'premium', 'elite']) })
  .strict();

interface TierParams {
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function internalRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): Promise<void> {
  const { pool } = options;

  app.post(
    '/internal/users/:userId/tier',
    async (
      request: FastifyRequest<{ Params: TierParams }>,
      reply: FastifyReply,
    ): Promise<void> => {
      const idempotencyKey = request.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
        throw new ValidationError('Idempotency-Key header is required', [
          { field: 'Idempotency-Key', issue: 'missing or empty' },
        ]);
      }

      const parsed = UpdateTierBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request body', parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          issue: e.message,
        })));
      }

      const { userId } = request.params;
      const { tier } = parsed.data;

      const result = await tierSyncService.updateTier(
        pool,
        userId,
        tier,
        idempotencyKey,
        request.log,
      );

      if (!result.applied) {
        await reply.status(409).send({
          error: {
            code: 'DUPLICATE_REQUEST',
            message: 'Idempotency key already processed',
            requestId: request.id,
          },
        });
        return;
      }

      await reply.status(200).send({ ok: true });
    },
  );
}
