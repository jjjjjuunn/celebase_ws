import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

export async function refreshMealPlanMonthlyStats(
  pool: pg.Pool,
  log: FastifyBaseLogger,
): Promise<'refreshed' | 'skipped_lock_contention' | 'skipped_disabled'> {
  // Attempt to acquire advisory lock
  const { rows } = await pool.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock(hashtext('mview_meal_plan_monthly_stats')) AS locked`,
  );
  const locked = rows[0]?.locked;
  if (!locked) {
    return 'skipped_lock_contention';
  }

  const start = Date.now();
  try {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY meal_plan_monthly_stats');
    log.info({ duration_ms: Date.now() - start }, 'mview.meal_plan_monthly_stats.refreshed');
    return 'refreshed';
  } catch (err) {
    const msg = (err as Error).message;
    const code = (err as NodeJS.ErrnoException).code;

    if (msg.includes('another operation is in progress') || msg.includes('query_canceled') || code === '57014') {
      log.debug({ err }, 'mview.meal_plan_monthly_stats.skipped_lock_contention');
      return 'skipped_lock_contention';
    }
    throw err;
  } finally {
    // Release lock if held
    try {
      await pool.query("SELECT pg_advisory_unlock(hashtext('mview_meal_plan_monthly_stats'))");
    } catch (unlockErr) {
      log.warn({ err: (unlockErr as Error).message }, 'mview.advisory_unlock.error');
    }
  }
}
