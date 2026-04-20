import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';

export type SubscriptionTier = 'free' | 'premium' | 'elite';

export interface UpdateTierResult {
  applied: boolean;
}

export async function updateTier(
  pool: pg.Pool,
  userId: string,
  tier: SubscriptionTier,
  idempotencyKey: string,
  log: FastifyBaseLogger,
): Promise<UpdateTierResult> {
  const client = await pool.connect();
  try {
    // Read-through: check idempotency ledger (reject duplicate within 24h)
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM tier_sync_idempotency WHERE idempotency_key = $1 AND expires_at > NOW()',
      [idempotencyKey],
    );

    if ((existing.rowCount ?? 0) > 0) {
      return { applied: false };
    }

    log.info(
      { userId_prefix: userId.slice(0, 8), tier, idempotency_key_prefix: idempotencyKey.slice(0, 16) },
      'subscription.sync.started',
    );

    // Update users.subscription_tier
    await client.query(
      'UPDATE users SET subscription_tier = $1 WHERE id = $2',
      [tier, userId],
    );

    // Record idempotency key — ON CONFLICT DO NOTHING for concurrent safety
    await client.query(
      `INSERT INTO tier_sync_idempotency (idempotency_key, user_id, tier)
       VALUES ($1, $2, $3)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [idempotencyKey, userId, tier],
    );

    log.info(
      { userId_prefix: userId.slice(0, 8), tier },
      'subscription.sync.success',
    );

    return { applied: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    log.error(
      { userId_prefix: userId.slice(0, 8), tier, reason_code: message },
      'subscription.sync.failed',
    );
    throw err;
  } finally {
    client.release();
  }
}
