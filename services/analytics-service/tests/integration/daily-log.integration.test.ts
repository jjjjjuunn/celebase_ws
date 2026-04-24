
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { schemas } from '@celebbase/shared-types';

const mockUpsert = jest.fn();
const mockFindByDateRange = jest.fn();
const mockGetSummary = jest.fn();

jest.unstable_mockModule('../../src/repositories/daily-log.repository.js', () => ({
  upsert: mockUpsert,
  findByDateRange: mockFindByDateRange,
  getSummary: mockGetSummary,
}));

const dailyLogRoutes = (await import('../../src/routes/daily-log.routes.js')).dailyLogRoutes;

type DailyLogWire = schemas.DailyLogWire;

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  // Decorate request with userId (bypass auth)
  app.decorateRequest('userId', 'test-user-id');
  const pool = {} as pg.Pool;
  void app.register(dailyLogRoutes, { pool });
  return app;
}

const baseDailyLog: DailyLogWire = {
  id: 'log-1',
  user_id: 'test-user-id',
  log_date: '2026-04-20',
  meals_completed: { breakfast: true },
  weight_kg: 75.5,
  energy_level: 4,
  mood: 3,
  sleep_quality: 4,
  notes: null,
  created_at: new Date().toISOString(),
};

let app: FastifyInstance;

beforeEach(async () => {
  app = makeApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  jest.clearAllMocks();
});

describe('daily-log routes integration', () => {
  it('POST /daily-logs then GET list and summary', async () => {
    mockUpsert.mockResolvedValueOnce(baseDailyLog);
    mockFindByDateRange.mockResolvedValueOnce({ data: [], hasNext: false });
    mockGetSummary.mockResolvedValueOnce({
      total_logs: 1,
      avg_energy_level: 4,
      avg_mood: 3,
      avg_sleep_quality: 4,
      avg_weight_kg: 75.5,
      completion_rate: 1,
    });

    // POST
    const postResp = await app.inject({
      method: 'POST',
      url: '/daily-logs',
      payload: { log_date: '2026-04-20', weight_kg: 75.5, energy_level: 4 },
    });
    expect(postResp.statusCode).toBe(200);
    expect(mockUpsert).toHaveBeenCalled();

    // GET list
    const listResp = await app.inject({
      method: 'GET',
      url: '/daily-logs?start_date=2026-04-01&end_date=2026-04-30',
    });
    expect(listResp.statusCode).toBe(200);
    const listBody = listResp.json();
    expect(listBody).toEqual({ data: [], has_next: false });

    // GET summary
    const summaryResp = await app.inject({ method: 'GET', url: '/daily-logs/summary?range=7d' });
    expect(summaryResp.statusCode).toBe(200);
    const summaryBody = summaryResp.json();
    expect(summaryBody.total_logs).toBe(1);
    expect(mockGetSummary).toHaveBeenCalled();
  });
});
