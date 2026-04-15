import type pg from 'pg';
import type { Subscription } from '@celebbase/shared-types';

/**
 * Find the most recent non-expired subscription for a user.
 */
export async function findByUserId(
  pool: pg.Pool,
  userId: string,
): Promise<Subscription | null> {
  const { rows } = await pool.query<Subscription>(
    `SELECT * FROM subscriptions
     WHERE user_id = $1 AND status != 'expired'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Find subscription by Stripe subscription ID (used by webhook handlers).
 */
export async function findByStripeSubscriptionId(
  pool: pg.Pool,
  stripeSubscriptionId: string,
): Promise<Subscription | null> {
  const { rows } = await pool.query<Subscription>(
    'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1 LIMIT 1',
    [stripeSubscriptionId],
  );
  return rows[0] ?? null;
}

/**
 * Update a subscription by its Stripe subscription ID.
 * Returns null if no matching row exists.
 */
export async function updateByStripeId(
  client: pg.Pool | pg.PoolClient,
  stripeSubscriptionId: string,
  data: {
    status?: 'active' | 'past_due' | 'cancelled' | 'expired';
    tier?: 'premium' | 'elite';
    current_period_start?: Date;
    current_period_end?: Date;
    cancel_at_period_end?: boolean;
  },
): Promise<Subscription | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.status !== undefined) {
    fields.push(`status = $${String(idx++)}`);
    values.push(data.status);
  }
  if (data.tier !== undefined) {
    fields.push(`tier = $${String(idx++)}`);
    values.push(data.tier);
  }
  if (data.current_period_start !== undefined) {
    fields.push(`current_period_start = $${String(idx++)}`);
    values.push(data.current_period_start);
  }
  if (data.current_period_end !== undefined) {
    fields.push(`current_period_end = $${String(idx++)}`);
    values.push(data.current_period_end);
  }
  if (data.cancel_at_period_end !== undefined) {
    fields.push(`cancel_at_period_end = $${String(idx++)}`);
    values.push(data.cancel_at_period_end);
  }

  if (fields.length === 0) return null;

  values.push(stripeSubscriptionId);
  const { rows } = await client.query<Subscription>(
    `UPDATE subscriptions SET ${fields.join(', ')}, updated_at = NOW()
     WHERE stripe_subscription_id = $${String(idx)}
     RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

/**
 * Atomically sync subscription + users.subscription_tier in a single transaction.
 *
 * Steps (order matters for partial unique index on active subs):
 *   1. Expire any existing active/past_due subscription for this user
 *      (except the one being upserted)
 *   2. Upsert the subscription row by stripe_subscription_id
 *   3. Update users.subscription_tier
 *
 * @param pool - connection pool (a PoolClient is acquired internally for the transaction)
 * @param userId - internal user ID
 * @param stripeSubscriptionId - Stripe subscription ID
 * @param subData - subscription fields to upsert
 * @param userTier - the tier value to write to users.subscription_tier
 */
export async function syncTierTransaction(
  pool: pg.Pool,
  userId: string,
  stripeSubscriptionId: string,
  subData: {
    tier: 'premium' | 'elite';
    stripe_customer_id: string;
    status: 'active' | 'past_due' | 'cancelled' | 'expired';
    current_period_start: Date;
    current_period_end: Date;
    cancel_at_period_end?: boolean;
  },
  userTier: 'free' | 'premium' | 'elite',
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Expire existing active/past_due subs for this user (except the current one)
    await client.query(
      `UPDATE subscriptions
       SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1
         AND status IN ('active', 'past_due')
         AND stripe_subscription_id IS DISTINCT FROM $2`,
      [userId, stripeSubscriptionId],
    );

    // Step 2: Upsert subscription by stripe_subscription_id
    await client.query(
      `INSERT INTO subscriptions (
         user_id, tier, stripe_subscription_id, stripe_customer_id,
         status, current_period_start, current_period_end, cancel_at_period_end
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         status = EXCLUDED.status,
         tier = EXCLUDED.tier,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         updated_at = NOW()`,
      [
        userId,
        subData.tier,
        stripeSubscriptionId,
        subData.stripe_customer_id,
        subData.status,
        subData.current_period_start,
        subData.current_period_end,
        subData.cancel_at_period_end ?? false,
      ],
    );

    // Step 3: Sync users.subscription_tier
    await client.query(
      'UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2',
      [userTier, userId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
