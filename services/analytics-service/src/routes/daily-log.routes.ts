import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { ZodIssue } from 'zod';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import { schemas } from '@celebbase/shared-types';
import * as dailyLogService from '../services/daily-log.service.js';

const SummaryQuerySchema = z.object({
  range: z.enum(['7d', '30d']),
});

export function dailyLogRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): void {
  const { pool } = options;

  app.post('/daily-logs', async (request: FastifyRequest) => {
    const parsed = schemas.CreateDailyLogRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e: ZodIssue) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return dailyLogService.createOrUpdate(pool, request.userId, parsed.data, request.log);
  });

  app.get('/daily-logs', async (request: FastifyRequest) => {
    const parsed = schemas.DailyLogListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query', parsed.error.errors.map((e: ZodIssue) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const { start_date, end_date, cursor, limit } = parsed.data;
    const result = await dailyLogService.listByRange(pool, request.userId, start_date, end_date, cursor, limit, request.log);
    return { data: result.data, has_next: result.hasNext };
  });

  app.get('/daily-logs/summary', async (request: FastifyRequest) => {
    const parsed = SummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query', parsed.error.errors.map((e: ZodIssue) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const today = new Date();
    const days = parsed.data.range === '7d' ? 7 : 30;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    const start = startDate.toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);

    return dailyLogService.getSummary(pool, request.userId, start, end, parsed.data.range, request.log);
  });
}
