import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import * as dailyLogService from '../services/daily-log.service.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const CreateDailyLogSchema = z.object({
  log_date: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  meals_completed: z.record(z.string(), z.boolean()).optional(),
  weight_kg: z.number().min(20).max(500).optional().nullable(),
  energy_level: z.number().int().min(1).max(5).optional().nullable(),
  mood: z.number().int().min(1).max(5).optional().nullable(),
  sleep_quality: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const ListQuerySchema = z.object({
  start_date: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  end_date: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  cursor: z.string().regex(DATE_REGEX).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const SummaryQuerySchema = z.object({
  start_date: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  end_date: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
});

// eslint-disable-next-line @typescript-eslint/require-await
export async function dailyLogRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): Promise<void> {
  const { pool } = options;

  app.post('/daily-logs', async (request: FastifyRequest) => {
    const parsed = CreateDailyLogSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return dailyLogService.createOrUpdate(pool, request.userId, parsed.data);
  });

  app.get('/daily-logs', async (request: FastifyRequest) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const { start_date, end_date, cursor, limit } = parsed.data;
    const result = await dailyLogService.listByRange(pool, request.userId, start_date, end_date, cursor, limit);
    return {
      data: result.data,
      has_next: result.hasNext,
    };
  });

  app.get('/daily-logs/summary', async (request: FastifyRequest) => {
    const parsed = SummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return dailyLogService.getSummary(pool, request.userId, parsed.data.start_date, parsed.data.end_date);
  });
}
