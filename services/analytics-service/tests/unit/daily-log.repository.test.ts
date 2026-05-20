import { jest, describe, it, expect } from '@jest/globals';
import type pg from 'pg';
import {
  mapRowToWire,
  toIsoDate,
  upsert,
  findByDateRange,
  getSummary,
} from '../../src/repositories/daily-log.repository.js';

// Regression: pg returns a Postgres DATE column as a JS Date object, but the
// wire contract is a 'YYYY-MM-DD' string. mapRowToWire must convert it or
// DailyLogWireSchema.parse throws ("Expected string, received date") → 500 on
// every POST /daily-logs and any GET that returns rows. This was latent on
// staging only because that user's daily_logs table was empty (no rows mapped).

function poolReturning(rows: unknown[]): pg.Pool {
  return {
    query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows }),
  } as unknown as pg.Pool;
}

const row = (logDate: Date | string): Record<string, unknown> => ({
  id: '019e4470-31d4-7e14-a4e2-9ca1073109cf',
  user_id: '019e4470-0000-7000-8000-000000000001',
  log_date: logDate,
  meals_completed: {},
  weight_kg: 60,
  energy_level: null,
  mood: 4,
  sleep_quality: null,
  notes: null,
  created_at: new Date('2026-05-20T08:00:00.000Z'),
});

describe('toIsoDate', () => {
  it('formats a Date to YYYY-MM-DD from local components', () => {
    expect(toIsoDate(new Date(2026, 4, 20))).toBe('2026-05-20');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('passes a string through unchanged', () => {
    expect(toIsoDate('2026-05-20')).toBe('2026-05-20');
  });
});

describe('mapRowToWire', () => {
  it('maps a row whose log_date is a JS Date (pg DATE) to a wire string', () => {
    const wire = mapRowToWire(row(new Date(2026, 4, 20)));
    expect(wire.log_date).toBe('2026-05-20');
    expect(wire.mood).toBe(4);
    expect(wire.weight_kg).toBe(60);
  });

  it('maps a row whose log_date is already a string', () => {
    expect(mapRowToWire(row('2026-05-19')).log_date).toBe('2026-05-19');
  });
});

describe('upsert', () => {
  it('returns a wire object with log_date as a string when pg returns a Date', async () => {
    const pool = poolReturning([row(new Date(2026, 4, 20))]);
    const result = await upsert(pool, '019e4470-0000-7000-8000-000000000001', {
      log_date: '2026-05-20',
      weight_kg: 60,
      mood: 4,
    });
    expect(result.log_date).toBe('2026-05-20');
    expect(result.mood).toBe(4);
  });

  it('throws if no row is returned', async () => {
    const pool = poolReturning([]);
    await expect(upsert(pool, 'u1', { log_date: '2026-05-20' })).rejects.toThrow(
      'DailyLog not found after upsert',
    );
  });
});

describe('findByDateRange', () => {
  it('maps Date rows to wire strings; hasNext=false under the limit', async () => {
    const pool = poolReturning([row(new Date(2026, 4, 20)), row(new Date(2026, 4, 19))]);
    const { data, hasNext } = await findByDateRange(
      pool,
      'u1',
      '2026-05-01',
      '2026-05-31',
      undefined,
      20,
    );
    expect(hasNext).toBe(false);
    expect(data.map((d) => d.log_date)).toEqual(['2026-05-20', '2026-05-19']);
  });

  it('hasNext=true and trims the extra row when over the limit', async () => {
    const pool = poolReturning([row(new Date(2026, 4, 20)), row(new Date(2026, 4, 19))]);
    const { data, hasNext } = await findByDateRange(
      pool,
      'u1',
      '2026-05-01',
      '2026-05-31',
      '2026-05-21',
      1,
    );
    expect(hasNext).toBe(true);
    expect(data).toHaveLength(1);
  });
});

describe('getSummary', () => {
  it('aggregates counts and averages', async () => {
    const pool = poolReturning([
      {
        total_logs: '2',
        avg_energy_level: '3.5',
        avg_mood: '4.0',
        avg_sleep_quality: null,
        avg_weight_kg: '60.5',
        logs_with_meals: '1',
      },
    ]);
    const summary = await getSummary(pool, 'u1', '2026-05-13', '2026-05-20');
    expect(summary.total_logs).toBe(2);
    expect(summary.avg_mood).toBe(4);
    expect(summary.avg_weight_kg).toBe(60.5);
    expect(summary.completion_rate).toBe(0.5);
  });
});
