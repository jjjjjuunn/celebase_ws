
import { jest, describe, it, expect, test, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';

const { refreshMealPlanMonthlyStats } = await import('../../src/repositories/mview.repository.js');

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  child: jest.fn(() => mockLog),
} as unknown as FastifyBaseLogger;

const dbUrl = process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  // Skip all tests if no DB connection
  test.skip('Postgres TEST_DATABASE_URL not set; skipping mview tests', () => {});
} else {
  const pool = new pg.Pool({ connectionString: dbUrl });

  afterAll(async () => {
    await pool.end();
  });

  describe('mview refresh with advisory lock', () => {
    it('skips when advisory lock held by another session', async () => {
      // acquire lock via pool1
      const client1 = await pool.connect();
      await client1.query("SELECT pg_advisory_lock(hashtext('mview_meal_plan_monthly_stats'))");

      const result = await refreshMealPlanMonthlyStats(pool, mockLog);
      expect(result).toBe('skipped_lock_contention');

      await client1.query("SELECT pg_advisory_unlock(hashtext('mview_meal_plan_monthly_stats'))");
      client1.release();
    });

    it('refreshes or skips when lock free', async () => {
      const result = await refreshMealPlanMonthlyStats(pool, mockLog);
      expect(['refreshed', 'skipped_lock_contention']).toContain(result);
    });
  });
}
