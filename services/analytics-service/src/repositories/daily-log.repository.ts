import type pg from 'pg';
import { schemas } from '@celebbase/shared-types';

type DailyLogWire = schemas.DailyLogWire;
type DailyLogSummaryResponse = schemas.DailyLogSummaryResponse;
const { DailyLogWireSchema, DailyLogSummaryResponseSchema } = schemas;

/** Input data for create/update daily log */
export type CreateDailyLogData = {
  log_date: string;
  meals_completed?: schemas.MealsCompleted | undefined;
  weight_kg?: number | null | undefined;
  energy_level?: number | null | undefined;
  mood?: number | null | undefined;
  sleep_quality?: number | null | undefined;
  notes?: string | null | undefined;
};

function mapRowToWire(row: Record<string, unknown>): DailyLogWire {
  return DailyLogWireSchema.parse({
    id: row['id'],
    user_id: row['user_id'],
    log_date: row['log_date'],
    meals_completed: row['meals_completed'] ?? {},
    weight_kg: row['weight_kg'],
    energy_level: row['energy_level'],
    mood: row['mood'],
    sleep_quality: row['sleep_quality'],
    notes: row['notes'],
    created_at: row['created_at'] instanceof Date
      ? row['created_at'].toISOString()
      : String(row['created_at']),
  });
}

export async function upsert(
  pool: pg.Pool,
  userId: string,
  data: CreateDailyLogData,
): Promise<DailyLogWire> {
  // Build INSERT values (fixed order as in table definition)
  const insertValues: unknown[] = [
    userId,
    data.log_date,
    JSON.stringify(data.meals_completed ?? {}),
    data.weight_kg ?? null,
    data.energy_level ?? null,
    data.mood ?? null,
    data.sleep_quality ?? null,
    data.notes ?? null,
  ];

  // Build dynamic SET clause for ON CONFLICT update
  const setClause: string[] = [];
  if (data.meals_completed !== undefined) setClause.push('meals_completed = EXCLUDED.meals_completed');
  if (data.weight_kg !== undefined)       setClause.push('weight_kg = EXCLUDED.weight_kg');
  if (data.energy_level !== undefined)    setClause.push('energy_level = EXCLUDED.energy_level');
  if (data.mood !== undefined)            setClause.push('mood = EXCLUDED.mood');
  if (data.sleep_quality !== undefined)   setClause.push('sleep_quality = EXCLUDED.sleep_quality');
  if (data.notes !== undefined)           setClause.push('notes = EXCLUDED.notes');

  const setStr = setClause.length > 0 ? `DO UPDATE SET ${setClause.join(', ')}` : 'DO NOTHING';

  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO daily_logs (
        user_id, log_date, meals_completed, weight_kg, energy_level, mood, sleep_quality, notes
     ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, log_date) ${setStr}
     RETURNING *`,
    insertValues,
  );
  const row = rows[0];
  if (!row) throw new Error('DailyLog not found after upsert');
  return mapRowToWire(row);
}

export async function findByDateRange(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
  cursor: string | undefined,
  limit: number,
): Promise<{ data: DailyLogWire[]; hasNext: boolean }> {
  const params: unknown[] = [userId, startDate, endDate, limit + 1];
  let cursorClause = '';
  if (cursor) {
    cursorClause = 'AND dl.log_date < $5';
    params.push(cursor);
  }

  const { rows } = await pool.query<Record<string, unknown>>(
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

  return { data: rows.map(mapRowToWire), hasNext };
}

export async function getSummary(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DailyLogSummaryResponse> {
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

  return DailyLogSummaryResponseSchema.parse({
    total_logs: totalLogs,
    avg_energy_level: row?.avg_energy_level ? parseFloat(parseFloat(row.avg_energy_level).toFixed(1)) : null,
    avg_mood: row?.avg_mood ? parseFloat(parseFloat(row.avg_mood).toFixed(1)) : null,
    avg_sleep_quality: row?.avg_sleep_quality ? parseFloat(parseFloat(row.avg_sleep_quality).toFixed(1)) : null,
    avg_weight_kg: row?.avg_weight_kg ? parseFloat(parseFloat(row.avg_weight_kg).toFixed(1)) : null,
    completion_rate: totalLogs > 0 ? parseFloat((logsWithMeals / totalLogs).toFixed(2)) : 0,
  });
}
