import type pg from 'pg';

export async function findTierByUserId(
  pool: pg.Pool,
  userId: string,
): Promise<{ tier: string }> {
  const { rows } = await pool.query<{ subscription_tier: string }>(
    'SELECT subscription_tier FROM users WHERE id = $1',
    [userId],
  );
  const tier = rows[0]?.subscription_tier ?? 'free';
  return { tier };
}

/**
 * Fetch the subscription tier together with the user's bio-profile creation
 * time (the post-onboarding trial anchor). `bio_profiles` is unique per user
 * (`ON CONFLICT (user_id)`), so the LEFT JOIN yields at most one row; a null
 * `bio_created_at` means onboarding is incomplete → no trial.
 */
export async function findSubscriptionStateByUserId(
  pool: pg.Pool,
  userId: string,
): Promise<{ tier: string; bioCreatedAt: Date | null }> {
  const { rows } = await pool.query<{
    subscription_tier: string;
    bio_created_at: Date | null;
  }>(
    `SELECT u.subscription_tier, b.created_at AS bio_created_at
       FROM users u
       LEFT JOIN bio_profiles b ON b.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  return {
    tier: rows[0]?.subscription_tier ?? 'free',
    bioCreatedAt: rows[0]?.bio_created_at ?? null,
  };
}

