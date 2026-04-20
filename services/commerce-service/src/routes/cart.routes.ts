import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import type { InstacartAdapter } from '../adapters/instacart.adapter.js';
import type { AmazonFreshAdapter } from '../adapters/amazon-fresh.adapter.js';
import { createCart } from '../services/cart-fallback.service.js';

const CartItemSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();

const CreateCartSchema = z
  .object({
    meal_plan_id: z.string().uuid(),
    items: z.array(CartItemSchema).min(1),
  })
  .strict();

export async function cartRoutes(
  app: FastifyInstance,
  opts: {
    pool: pg.Pool;
    instacartAdapter: InstacartAdapter;
    amazonFreshAdapter: AmazonFreshAdapter;
  },
): Promise<void> {
  const { pool, instacartAdapter, amazonFreshAdapter } = opts;

  await app.register(async (scope) => {
    scope.post('/cart', async (request: FastifyRequest, reply: FastifyReply) => {
      const idempotencyKeyHeader = request.headers['idempotency-key'];
      if (typeof idempotencyKeyHeader !== 'string' || idempotencyKeyHeader.length === 0) {
        return reply.status(400).send({
          error: {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: 'Idempotency-Key header is required',
            requestId: request.id,
          },
        });
      }

      const parsed = CreateCartSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid input',
          parsed.error.errors.map((e) => ({ field: e.path.join('.'), issue: e.message })),
        );
      }

      const { meal_plan_id, items } = parsed.data;

      const cartResult = await createCart({
        items,
        instacartAdapter,
        amazonFreshAdapter,
      });

      await pool.query(
        `INSERT INTO instacart_orders (user_id, meal_plan_id, items, status)
         VALUES ($1, $2, $3::jsonb, 'pending')`,
        [request.userId, meal_plan_id, JSON.stringify(items)],
      );

      return reply.status(200).send(cartResult);
    });
  });
}