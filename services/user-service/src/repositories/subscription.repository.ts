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

