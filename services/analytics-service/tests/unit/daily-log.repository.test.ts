import { describe, it, expect } from '@jest/globals';
import { mapRowToWire, toIsoDate } from '../../src/repositories/daily-log.repository.js';

// Regression: pg returns a Postgres DATE column as a JS Date object, but the
// wire contract is a 'YYYY-MM-DD' string. mapRowToWire must convert it or
// DailyLogWireSchema.parse throws ("Expected string, received date") → 500 on
// every POST /daily-logs and any GET that returns rows. This was latent on
// staging only because that user's daily_logs table was empty (no rows mapped).
describe('daily-log.repository toIsoDate', () => {
  it('formats a Date to YYYY-MM-DD from local components', () => {
    expect(toIsoDate(new Date(2026, 4, 20))).toBe('2026-05-20');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('passes a string through unchanged', () => {
    expect(toIsoDate('2026-05-20')).toBe('2026-05-20');
  });
});

describe('daily-log.repository mapRowToWire', () => {
  const baseRow = {
    id: '019e4470-31d4-7e14-a4e2-9ca1073109cf',
    user_id: '019e4470-0000-7000-8000-000000000001',
    meals_completed: {},
    weight_kg: 60,
    energy_level: null,
    mood: 4,
    sleep_quality: null,
    notes: null,
    created_at: new Date('2026-05-20T08:00:00.000Z'),
  };

  it('maps a row whose log_date is a JS Date (pg DATE) to a wire string', () => {
    const wire = mapRowToWire({ ...baseRow, log_date: new Date(2026, 4, 20) });
    expect(wire.log_date).toBe('2026-05-20');
    expect(wire.mood).toBe(4);
    expect(wire.weight_kg).toBe(60);
  });

  it('maps a row whose log_date is already a string', () => {
    const wire = mapRowToWire({ ...baseRow, log_date: '2026-05-19' });
    expect(wire.log_date).toBe('2026-05-19');
  });
});
