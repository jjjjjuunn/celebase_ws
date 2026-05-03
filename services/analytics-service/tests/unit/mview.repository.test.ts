
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

const mockQuery = jest.fn();
const pool = { query: mockQuery } as unknown as pg.Pool;

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  silent: jest.fn(),
} as unknown as FastifyBaseLogger;

const { refreshMealPlanMonthlyStats } = await import('../../src/repositories/mview.repository.js');

describe('mview.repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes successfully when advisory lock acquired', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ locked: true }] })  // pg_try_advisory_lock
      .mockResolvedValueOnce({ rows: [] })                   // REFRESH MATERIALIZED VIEW
      .mockResolvedValueOnce({ rows: [] });                  // pg_advisory_unlock
    const result = await refreshMealPlanMonthlyStats(pool, mockLog);
    expect(result).toBe('refreshed');
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ duration_ms: expect.any(Number) }),
      'mview.meal_plan_monthly_stats.refreshed',
    );
  });

  it('returns skipped_lock_contention when lock not acquired', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ locked: false }] });
    const result = await refreshMealPlanMonthlyStats(pool, mockLog);
    expect(result).toBe('skipped_lock_contention');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('returns skipped_lock_contention on "another operation is in progress"', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockRejectedValueOnce(new Error('another operation is in progress'))
      .mockResolvedValueOnce({ rows: [] }); // unlock
    const result = await refreshMealPlanMonthlyStats(pool, mockLog);
    expect(result).toBe('skipped_lock_contention');
    expect(mockLog.debug).toHaveBeenCalled();
  });

  it('returns skipped_lock_contention on query_canceled error', async () => {
    const cancelErr = Object.assign(new Error('query_canceled'), { code: '57014' });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockRejectedValueOnce(cancelErr)
      .mockResolvedValueOnce({ rows: [] });
    const result = await refreshMealPlanMonthlyStats(pool, mockLog);
    expect(result).toBe('skipped_lock_contention');
  });

  it('rethrows unexpected errors from REFRESH', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockRejectedValueOnce(new Error('unexpected DB error'))
      .mockResolvedValueOnce({ rows: [] }); // unlock in finally
    await expect(refreshMealPlanMonthlyStats(pool, mockLog)).rejects.toThrow('unexpected DB error');
  });

  it('logs warning when advisory unlock fails but still returns result', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [] })                      // REFRESH
      .mockRejectedValueOnce(new Error('unlock failed'));       // unlock throw
    const result = await refreshMealPlanMonthlyStats(pool, mockLog);
    expect(result).toBe('refreshed');
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'unlock failed' }),
      'mview.advisory_unlock.error',
    );
  });
});
