import type pg from 'pg';
import type { DailyLog } from '@celebbase/shared-types';
import * as dailyLogRepo from '../repositories/daily-log.repository.js';

export async function createOrUpdate(
  pool: pg.Pool,
  userId: string,
  data: {
    log_date: string;
    meals_completed?: Record<string, boolean> | undefined;
    weight_kg?: number | null | undefined;
    energy_level?: number | null | undefined;
    mood?: number | null | undefined;
    sleep_quality?: number | null | undefined;
    notes?: string | null | undefined;
  },
): Promise<DailyLog> {
  return dailyLogRepo.upsert(pool, userId, data);
}

export async function listByRange(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
  cursor: string | undefined,
  limit: number,
): Promise<{ data: DailyLog[]; hasNext: boolean }> {
  return dailyLogRepo.findByDateRange(pool, userId, startDate, endDate, cursor, limit);
}

export async function getSummary(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{
  total_logs: number;
  avg_energy_level: number | null;
  avg_mood: number | null;
  avg_sleep_quality: number | null;
  avg_weight_kg: number | null;
  completion_rate: number;
}> {
  return dailyLogRepo.getSummary(pool, userId, startDate, endDate);
}
