import type pg from 'pg';
import type { Subscription } from '@celebbase/shared-types';

interface UpsertSubscriptionParams {
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  tier: 'premium' | 'elite';
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
}

export async function upsertSubscription(
  pool: pg.Pool,
  params: UpsertSubscriptionParams,
): Promise<Subscription> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Expire any existing active/past_due subscriptions for this user
    // (except the one being upserted, which may not exist yet)
    await client.query(
      `UPDATE subscriptions
       SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1
         AND status IN ('active', 'past_due')
         AND (stripe_subscription_id IS DISTINCT FROM $2)`,
      [params.userId, params.stripeSubscriptionId],
    );

    const { rows } = await client.query<Subscription>(
      `INSERT INTO subscriptions (
         user_id, stripe_subscription_id, stripe_customer_id,
         tier, status, current_period_start, current_period_end, cancel_at_period_end
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (stripe_subscription_id)
       DO UPDATE SET
         tier                 = EXCLUDED.tier,
         status               = EXCLUDED.status,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end   = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         updated_at           = NOW()
       RETURNING *`,
      [
        params.userId,
        params.stripeSubscriptionId,
        params.stripeCustomerId,
        params.tier,
        params.status,
        params.currentPeriodStart,
        params.currentPeriodEnd,
        params.cancelAtPeriodEnd ?? false,
      ],
    );

    await client.query('COMMIT');

    if (!rows[0]) throw new Error('upsertSubscription: no row returned after upsert');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

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
