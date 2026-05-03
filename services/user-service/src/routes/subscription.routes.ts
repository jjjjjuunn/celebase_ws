import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import * as subscriptionRepo from '../repositories/subscription.repository.js';

export function subscriptionRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): void {
  const { pool } = options;

  // GET /subscriptions/me — reads users.subscription_tier (commerce-service owns full subscription details)
  app.get('/subscriptions/me', async (request: FastifyRequest) => {
    return subscriptionRepo.findTierByUserId(pool, request.userId);
  });
}

