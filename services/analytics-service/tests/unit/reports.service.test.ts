
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

const { getWeeklyReport, getMonthlyReport } = await import('../../src/services/reports.service.js');

describe('reports.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWeeklyReport', () => {
    it('returns weekly report with data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_logs: '5',
          avg_energy_level: '3.5',
          avg_mood: '4.0',
          avg_sleep_quality: '3.8',
          avg_weight_kg: '70.5',
          logs_with_meals: '4',
        }],
      });
      const result = await getWeeklyReport(pool, 'user-123', mockLog);
      expect(result.total_logs).toBe(5);
      expect(result.avg_energy_level).toBe(3.5);
      expect(result.avg_mood).toBe(4.0);
      expect(result.completion_rate).toBe(0.8);
      expect(result.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.week_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({ latency_ms: expect.any(Number) }),
        'reports.weekly.queried',
      );
    });

    it('returns nulls when no numeric data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_logs: '0',
          avg_energy_level: null,
          avg_mood: null,
          avg_sleep_quality: null,
          avg_weight_kg: null,
          logs_with_meals: '0',
        }],
      });
      const result = await getWeeklyReport(pool, 'user-123', mockLog);
      expect(result.total_logs).toBe(0);
      expect(result.avg_energy_level).toBeNull();
      expect(result.completion_rate).toBe(0);
    });

    it('handles empty rows array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getWeeklyReport(pool, 'user-123', mockLog);
      expect(result.total_logs).toBe(0);
      expect(result.avg_energy_level).toBeNull();
    });
  });

  describe('getMonthlyReport', () => {
    it('returns monthly report with mview data', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_logs: '10',
            avg_energy_level: '3.2',
            avg_mood: '3.5',
            avg_sleep_quality: '3.7',
            avg_weight_kg: '71.0',
            logs_with_meals: '8',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ total_plans: '150', avg_duration: '7.3' }],
        });
      const result = await getMonthlyReport(pool, 'user-123', mockLog);
      expect(result.total_logs).toBe(10);
      expect(result.platform_total_meal_plans).toBe(150);
      expect(result.platform_avg_plan_duration_days).toBe(7.3);
      expect(result.month).toMatch(/^\d{4}-\d{2}$/);
      expect(result.completion_rate).toBe(0.8);
    });

    it('handles no mview data row', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_logs: '0',
            avg_energy_level: null,
            avg_mood: null,
            avg_sleep_quality: null,
            avg_weight_kg: null,
            logs_with_meals: '0',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const result = await getMonthlyReport(pool, 'user-123', mockLog);
      expect(result.platform_total_meal_plans).toBe(0);
      expect(result.platform_avg_plan_duration_days).toBeNull();
    });

    it('handles undefined avg_duration in mview row', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_logs: '3', avg_energy_level: null, avg_mood: null, avg_sleep_quality: null, avg_weight_kg: null, logs_with_meals: '2' }] })
        .mockResolvedValueOnce({ rows: [{ total_plans: '5', avg_duration: undefined }] });
      const result = await getMonthlyReport(pool, 'user-123', mockLog);
      expect(result.platform_total_meal_plans).toBe(5);
      expect(result.platform_avg_plan_duration_days).toBeNull();
    });
  });
});
