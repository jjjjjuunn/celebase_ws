import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RedisClientType } from 'redis';

const TICKET_TTL_SEC = 30;
const RATE_LIMIT_PER_MIN = 10;

// eslint-disable-next-line @typescript-eslint/require-await
export async function wsTicketRoutes(
  app: FastifyInstance,
  options: { redis: RedisClientType },
): Promise<void> {
  const { redis } = options;

  app.post(
    '/ws/ticket',
    {
      config: {
        rateLimit: {
          max: RATE_LIMIT_PER_MIN,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => request.userId,
        },
      },
    },
    async (request: FastifyRequest) => {
      const ticket = `ws_${randomBytes(8).toString('hex')}`;

      await redis.set(`ws:ticket:${ticket}`, request.userId, { EX: TICKET_TTL_SEC });

      return { ticket, expires_in_sec: TICKET_TTL_SEC };
    },
  );
}
