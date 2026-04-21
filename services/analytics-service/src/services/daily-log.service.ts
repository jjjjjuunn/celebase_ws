import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { schemas } from '@celebbase/shared-types';

type DailyLogWire = schemas.DailyLogWire;
type DailyLogSummaryResponse = schemas.DailyLogSummaryResponse;
type CreateDailyLogRequest = schemas.CreateDailyLogRequest;
import * as dailyLogRepo from '../repositories/daily-log.repository.js';

export async function createOrUpdate(
  pool: pg.Pool,
  userId: string,
  data: CreateDailyLogRequest,
  log: FastifyBaseLogger,
): Promise<DailyLogWire> {
  const result = await dailyLogRepo.upsert(pool, userId, data);
  log.info({ user_id_hash: userId.slice(0, 8), log_date: data.log_date, source: 'analytics-service' }, 'dailylog.upsert');
  return result;
}

export async function listByRange(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
  cursor: string | undefined,
  limit: number,
  _log: FastifyBaseLogger,
): Promise<{ data: DailyLogWire[]; hasNext: boolean }> {
  return dailyLogRepo.findByDateRange(pool, userId, startDate, endDate, cursor, limit);
}

export async function getSummary(
  pool: pg.Pool,
  userId: string,
  startDate: string,
  endDate: string,
  range: '7d' | '30d',
  log: FastifyBaseLogger,
): Promise<DailyLogSummaryResponse> {
  const startMs = Date.now();
  const summary = await dailyLogRepo.getSummary(pool, userId, startDate, endDate);
  log.info({ user_id_hash: userId.slice(0, 8), range, latency_ms: Date.now() - startMs }, 'dailylog.summary.queried');
  return summary;
}
