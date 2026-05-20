import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import * as subscriptionRepo from '../repositories/subscription.repository.js';
import { computeTrialState } from '../lib/trial.js';

export function subscriptionRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): void {
  const { pool } = options;

  // GET /subscriptions/me — reads users.subscription_tier (commerce-service owns
  // full subscription details) plus the post-onboarding trial state derived from
  // bio_profiles.created_at. During the trial window the meal-plan-engine grants
  // a free-tier user Premium-equivalent generation quota (it reads trial_active).
  app.get('/subscriptions/me', async (request: FastifyRequest) => {
    const { tier, bioCreatedAt } = await subscriptionRepo.findSubscriptionStateByUserId(
      pool,
      request.userId,
    );
    const { trial_active, trial_ends_at } = computeTrialState(tier, bioCreatedAt);
    return { tier, trial_active, trial_ends_at };
  });
}

