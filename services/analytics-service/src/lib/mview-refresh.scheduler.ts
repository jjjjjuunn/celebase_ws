import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import { refreshMealPlanMonthlyStats } from '../repositories/mview.repository.js';

export function startMviewRefreshScheduler(
  pool: pg.Pool,
  log: FastifyBaseLogger,
  intervalMinutes: number,
  enabled: boolean,
): () => void {
  if (!enabled) {
    return () => { /* noop */ };
  }

  const run = async () => {
    log.info({ mview: 'meal_plan_monthly_stats' }, 'mview.refresh.started');
    const start = Date.now();
    try {
      const result = await refreshMealPlanMonthlyStats(pool, log);
      const duration_ms = Date.now() - start;
      if (result === 'refreshed') {
        log.info({ duration_ms }, 'mview.refresh.success');
      } else if (result === 'skipped_lock_contention') {
        log.debug({}, 'mview.refresh.skipped_lock_contention');
      }
    } catch (err) {
      log.error({ err }, 'mview.refresh.failed');
    }
  };

  void run();
  const timer = setInterval(() => { void run(); }, intervalMinutes * 60_000);

  return () => { clearInterval(timer); };
}
