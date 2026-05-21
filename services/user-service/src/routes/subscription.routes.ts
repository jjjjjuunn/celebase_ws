import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import * as subscriptionRepo from '../repositories/subscription.repository.js';

export function subscriptionRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): void {
  const { pool } = options;

  // GET /subscriptions/me — returns the user's tier only. commerce-service owns
  // full subscription details; meal-plan generation entitlement moved to the
  // credit model (meal-plan-engine GET /meal-plans/credits, IMPL-MEAL-CREDIT-001),
  // so the post-onboarding time-boxed trial state is no longer surfaced here.
  app.get('/subscriptions/me', async (request: FastifyRequest) => {
    const { tier } = await subscriptionRepo.findTierByUserId(pool, request.userId);
    return { tier };
  });
}
