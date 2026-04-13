import type pg from 'pg';
import type { DailyLog } from '@celebbase/shared-types';

type CreateData = {
  log_date: string;
  meals_completed?: Record<string, boolean> | undefined;
  weight_kg?: number | null | undefined;
  energy_level?: number | null | undefined;
  mood?: number | null | undefined;
  sleep_quality?: number | null | undefined;
  notes?: string | null | undefined;
};

export async function upsert(
  pool: pg.Pool,
  userId: string,
  data: CreateData,
): Promise<DailyLog> {
  const { rows } = await pool.query<DailyLog>(
    `INSERT INTO daily_logs
       (user_id, log_date, meals_completed, weight_kg, energy_level, mood, sleep_quality, notes)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, log_date) DO UPDATE SET
       meals_completed = EXCLUDED.meals_completed,
       weight_kg       = EXCLUDED.weight_kg,
       energy_level    = EXCLUDED.energy_level,
       mood            = EXCLUDED.mood,
       sleep_quality   = EXCLUDED.sleep_quality,
       notes           = EXCLUDED.notes
     RETURNING *`,
    [
      userId,
      data.log_date,
      JSON.stringify(data.meals_completed ?? {}),
      data.weight_kg ?? null,
      data.energy_level ?? null,
      data.mood ?? null,
      data.sleep_quality ?? null,
      data.notes ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('DailyLog not found after upsert');
  return row;
}

export async function findByDateRange(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
  cursor: string | undefined,
  limit: number,
): Promise<{ data: DailyLog[]; hasNext: boolean }> {
  const params: unknown[] = [userId, startDate, endDate, limit + 1];
  let cursorClause = '';
  if (cursor) {
    cursorClause = 'AND dl.log_date < $5';
    params.push(cursor);
  }

  const { rows } = await pool.query<DailyLog>(
    `SELECT * FROM daily_logs dl
     WHERE dl.user_id = $1
       AND dl.log_date >= $2
       AND dl.log_date <= $3
       ${cursorClause}
     ORDER BY dl.log_date DESC
     LIMIT $4`,
    params,
  );

  const hasNext = rows.length > limit;
  if (hasNext) rows.pop();

  return { data: rows, hasNext };
}

interface DailyLogSummary {
  total_logs: number;
  avg_energy_level: number | null;
  avg_mood: number | null;
  avg_sleep_quality: number | null;
  avg_weight_kg: number | null;
  completion_rate: number;
}

export async function getSummary(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DailyLogSummary> {
  const { rows } = await pool.query<{
    total_logs: string;
    avg_energy_level: string | null;
    avg_mood: string | null;
    avg_sleep_quality: string | null;
    avg_weight_kg: string | null;
    logs_with_meals: string;
  }>(
    `SELECT
       COUNT(*)::text                          AS total_logs,
       AVG(energy_level)::text                 AS avg_energy_level,
       AVG(mood)::text                         AS avg_mood,
       AVG(sleep_quality)::text                AS avg_sleep_quality,
       AVG(weight_kg)::text                    AS avg_weight_kg,
       COUNT(*) FILTER (WHERE meals_completed != '{}')::text AS logs_with_meals
     FROM daily_logs
     WHERE user_id = $1
       AND log_date >= $2
       AND log_date <= $3`,
    [userId, startDate, endDate],
  );

  const row = rows[0];
  const totalLogs = parseInt(row?.total_logs ?? '0', 10);
  const logsWithMeals = parseInt(row?.logs_with_meals ?? '0', 10);

  return {
    total_logs: totalLogs,
    avg_energy_level: row?.avg_energy_level ? parseFloat(parseFloat(row.avg_energy_level).toFixed(1)) : null,
    avg_mood: row?.avg_mood ? parseFloat(parseFloat(row.avg_mood).toFixed(1)) : null,
    avg_sleep_quality: row?.avg_sleep_quality ? parseFloat(parseFloat(row.avg_sleep_quality).toFixed(1)) : null,
    avg_weight_kg: row?.avg_weight_kg ? parseFloat(parseFloat(row.avg_weight_kg).toFixed(1)) : null,
    completion_rate: totalLogs > 0 ? parseFloat((logsWithMeals / totalLogs).toFixed(2)) : 0,
  };
}
