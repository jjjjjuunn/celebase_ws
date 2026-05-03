
import type pg from "pg";
import type { FastifyBaseLogger } from "fastify";

export type WeeklyReport = {
  week_start: string; // ISO date string (YYYY-MM-DD)
  week_end: string;   // ISO date string (YYYY-MM-DD)
  total_logs: number;
  avg_energy_level: number | null;
  avg_mood: number | null;
  avg_sleep_quality: number | null;
  avg_weight_kg: number | null;
  completion_rate: number;
};

export type MonthlyReport = {
  month: string; // YYYY-MM
  total_logs: number;
  avg_energy_level: number | null;
  avg_mood: number | null;
  avg_sleep_quality: number | null;
  avg_weight_kg: number | null;
  completion_rate: number;
  platform_total_meal_plans: number;
  platform_avg_plan_duration_days: number | null;
};

function parseFloatMaybe(val: string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const n = parseFloat(val);
  return Number.isNaN(n) ? null : parseFloat(n.toFixed(1));
}

function buildSummary(row: Record<string, string | null | undefined>) {
  const totalLogs = parseInt(row.total_logs ?? '0', 10);
  const logsWithMeals = parseInt(row.logs_with_meals ?? '0', 10);
  return {
    total_logs: totalLogs,
    avg_energy_level: parseFloatMaybe(row.avg_energy_level),
    avg_mood: parseFloatMaybe(row.avg_mood),
    avg_sleep_quality: parseFloatMaybe(row.avg_sleep_quality),
    avg_weight_kg: parseFloatMaybe(row.avg_weight_kg),
    completion_rate: totalLogs > 0 ? parseFloat((logsWithMeals / totalLogs).toFixed(2)) : 0,
  } as const;
}

export async function getWeeklyReport(
  pool: pg.Pool,
  userId: string,
  log: FastifyBaseLogger,
): Promise<WeeklyReport> {
  const endDate = new Date();
  const weekEnd = endDate.toISOString().slice(0, 10);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6);
  const weekStart = startDate.toISOString().slice(0, 10);

  const t0 = Date.now();
  const { rows } = await pool.query<Record<string, string | null | undefined>>(
    `SELECT
       COUNT(*)::text AS total_logs,
       AVG(energy_level)::text AS avg_energy_level,
       AVG(mood)::text AS avg_mood,
       AVG(sleep_quality)::text AS avg_sleep_quality,
       AVG(weight_kg)::text AS avg_weight_kg,
       COUNT(*) FILTER (WHERE meals_completed != '{}')::text AS logs_with_meals
     FROM daily_logs
     WHERE user_id = $1
       AND log_date >= $2
       AND log_date <= $3`,
    [userId, weekStart, weekEnd],
  );
  const summary = buildSummary(rows[0] ?? {});
  log.info({ user_id_hash: userId.slice(0, 8), latency_ms: Date.now() - t0 }, 'reports.weekly.queried');
  return { week_start: weekStart, week_end: weekEnd, ...summary };
}

export async function getMonthlyReport(
  pool: pg.Pool,
  userId: string,
  log: FastifyBaseLogger,
): Promise<MonthlyReport> {
  const today = new Date();
  const monthStr = today.toISOString().slice(0, 7); // YYYY-MM
  const monthStartDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthStart = monthStartDate.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  const t0 = Date.now();
  const { rows: userRows } = await pool.query<Record<string, string | null | undefined>>(
    `SELECT
       COUNT(*)::text AS total_logs,
       AVG(energy_level)::text AS avg_energy_level,
       AVG(mood)::text AS avg_mood,
       AVG(sleep_quality)::text AS avg_sleep_quality,
       AVG(weight_kg)::text AS avg_weight_kg,
       COUNT(*) FILTER (WHERE meals_completed != '{}')::text AS logs_with_meals
     FROM daily_logs
     WHERE user_id = $1
       AND log_date >= $2
       AND log_date <= $3`,
    [userId, monthStart, todayIso],
  );
  const userSummary = buildSummary(userRows[0] ?? {});

  const { rows: mvRows } = await pool.query<Record<string, string | null | undefined>>(
    `SELECT total_plans::text, avg_duration::text
     FROM meal_plan_monthly_stats
     WHERE month = DATE_TRUNC('month', NOW())`,
  );
  const mvRow = mvRows[0] ?? {};
  const platform_total_meal_plans = mvRow.total_plans ? parseInt(mvRow.total_plans, 10) : 0;
  const platform_avg_plan_duration_days = parseFloatMaybe(mvRow.avg_duration);

  log.info({ user_id_hash: userId.slice(0, 8), latency_ms: Date.now() - t0 }, 'reports.monthly.queried');
  return {
    month: monthStr,
    ...userSummary,
    platform_total_meal_plans,
    platform_avg_plan_duration_days,
  };
}
