import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { z } from 'zod';
import { fetchBff } from '../../_lib/bff-fetch';

const schema = z.unknown();
const baseOpts = {
  schema,
  requestId: 'test-req-001',
  userId: 'user-abc',
  authToken: 'token-xyz',
};

describe('BFF routing — daily-log proxy target', () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('analytics target routes to port 3005', () => {
    it('GET /daily-logs → http://localhost:3005/daily-logs', async () => {
      await fetchBff('analytics', '/daily-logs?start=2025-01-01&end=2025-01-07', baseOpts);
      const calledUrl = (fetchSpy.mock.calls[0] as [string, ...unknown[]])[0];
      expect(calledUrl).toContain('http://localhost:3005/daily-logs');
    });

    it('POST /daily-logs → http://localhost:3005/daily-logs', async () => {
      await fetchBff('analytics', '/daily-logs', {
        ...baseOpts,
        method: 'POST',
        body: JSON.stringify({ log_date: '2025-01-01', weight_kg: 70.5 }),
      });
      const calledUrl = (fetchSpy.mock.calls[0] as [string, ...unknown[]])[0];
      expect(calledUrl).toBe('http://localhost:3005/daily-logs');
    });

    it('GET /daily-logs/summary → http://localhost:3005/daily-logs/summary', async () => {
      await fetchBff('analytics', '/daily-logs/summary?range=7d', baseOpts);
      const calledUrl = (fetchSpy.mock.calls[0] as [string, ...unknown[]])[0];
      expect(calledUrl).toContain('http://localhost:3005/daily-logs/summary');
    });
  });

  describe('regression: user target still routes to port 3001', () => {
    it('GET /users/me → http://localhost:3001/users/me', async () => {
      await fetchBff('user', '/users/me', baseOpts);
      const calledUrl = (fetchSpy.mock.calls[0] as [string, ...unknown[]])[0];
      expect(calledUrl).toBe('http://localhost:3001/users/me');
    });
  });
});
