import { jest, describe, it, expect } from '@jest/globals';
import type pg from 'pg';

const mockUpsert = jest.fn();
const mockFindByDateRange = jest.fn();
const mockGetSummary = jest.fn();

jest.unstable_mockModule('../../src/repositories/daily-log.repository.js', () => ({
  upsert: mockUpsert,
  findByDateRange: mockFindByDateRange,
  getSummary: mockGetSummary,
}));

const { createOrUpdate, listByRange, getSummary } = await import('../../src/services/daily-log.service.js');

const mockPool = {} as pg.Pool;

const baseDailyLog = {
  id: 'log-1',
  user_id: 'user-1',
  log_date: '2026-04-13',
  meals_completed: { breakfast: true, lunch: false },
  weight_kg: 75.0,
  energy_level: 4,
  mood: 3,
  sleep_quality: 4,
  notes: null,
  created_at: new Date(),
};

describe('dailyLogService.createOrUpdate', () => {
  it('calls repository upsert and returns result', async () => {
    mockUpsert.mockResolvedValueOnce(baseDailyLog);

    const result = await createOrUpdate(mockPool, 'user-1', {
      log_date: '2026-04-13',
      meals_completed: { breakfast: true, lunch: false },
      weight_kg: 75.0,
      energy_level: 4,
      mood: 3,
      sleep_quality: 4,
    });

    expect(result).toEqual(baseDailyLog);
    expect(mockUpsert).toHaveBeenCalledWith(mockPool, 'user-1', {
      log_date: '2026-04-13',
      meals_completed: { breakfast: true, lunch: false },
      weight_kg: 75.0,
      energy_level: 4,
      mood: 3,
      sleep_quality: 4,
    });
  });

  it('handles minimal input (only log_date)', async () => {
    const minimalLog = { ...baseDailyLog, meals_completed: {}, weight_kg: null, energy_level: null, mood: null, sleep_quality: null };
    mockUpsert.mockResolvedValueOnce(minimalLog);

    const result = await createOrUpdate(mockPool, 'user-1', {
      log_date: '2026-04-13',
    });

    expect(result).toEqual(minimalLog);
  });
});

describe('dailyLogService.listByRange', () => {
  it('returns data and hasNext from repository', async () => {
    const logs = [baseDailyLog, { ...baseDailyLog, id: 'log-2', log_date: '2026-04-12' }];
    mockFindByDateRange.mockResolvedValueOnce({ data: logs, hasNext: false });

    const result = await listByRange(mockPool, 'user-1', '2026-04-01', '2026-04-30', undefined, 20);

    expect(result.data).toHaveLength(2);
    expect(result.hasNext).toBe(false);
    expect(mockFindByDateRange).toHaveBeenCalledWith(mockPool, 'user-1', '2026-04-01', '2026-04-30', undefined, 20);
  });

  it('passes cursor for pagination', async () => {
    mockFindByDateRange.mockResolvedValueOnce({ data: [baseDailyLog], hasNext: true });

    const result = await listByRange(mockPool, 'user-1', '2026-04-01', '2026-04-30', '2026-04-12', 10);

    expect(result.hasNext).toBe(true);
    expect(mockFindByDateRange).toHaveBeenCalledWith(mockPool, 'user-1', '2026-04-01', '2026-04-30', '2026-04-12', 10);
  });
});

describe('dailyLogService.getSummary', () => {
  it('returns aggregated summary from repository', async () => {
    const summary = {
      total_logs: 10,
      avg_energy_level: 3.5,
      avg_mood: 4.0,
      avg_sleep_quality: 3.8,
      avg_weight_kg: 74.5,
      completion_rate: 0.8,
    };
    mockGetSummary.mockResolvedValueOnce(summary);

    const result = await getSummary(mockPool, 'user-1', '2026-04-01', '2026-04-30');

    expect(result).toEqual(summary);
    expect(mockGetSummary).toHaveBeenCalledWith(mockPool, 'user-1', '2026-04-01', '2026-04-30');
  });

  it('handles empty period', async () => {
    const emptySummary = {
      total_logs: 0,
      avg_energy_level: null,
      avg_mood: null,
      avg_sleep_quality: null,
      avg_weight_kg: null,
      completion_rate: 0,
    };
    mockGetSummary.mockResolvedValueOnce(emptySummary);

    const result = await getSummary(mockPool, 'user-1', '2026-01-01', '2026-01-31');

    expect(result.total_logs).toBe(0);
    expect(result.avg_energy_level).toBeNull();
    expect(result.completion_rate).toBe(0);
  });
});
