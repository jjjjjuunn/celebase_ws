import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type pg from 'pg';

const { insert, revokeForRotation, findMetadata, revokeForLogout, revokeChainForLogout, revokeAllByUser } =
  await import('../../src/repositories/refresh-token.repository.js');

function makeClient(overrides: Partial<pg.Pool> = {}): pg.Pool {
  return {
    query: jest.fn<pg.Pool['query']>().mockResolvedValue({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }),
    ...overrides,
  } as unknown as pg.Pool;
}

const NOW = new Date('2026-01-01T00:00:00Z');

describe('refresh-token.repository', () => {
  describe('insert', () => {
    it('executes parameterized INSERT with jti, userId, expiresAt', async () => {
      const client = makeClient();
      await insert(client, { jti: 'jti-1', userId: 'user-1', expiresAt: NOW });
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refresh_tokens'),
        ['jti-1', 'user-1', NOW],
      );
    });
  });

  describe('revokeForRotation', () => {
    it('returns true when rowCount is 1 (token consumed)', async () => {
      const client = makeClient({
        query: jest.fn<pg.Pool['query']>().mockResolvedValue({
          rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
        }),
      } as Partial<pg.Pool>);
      const result = await revokeForRotation(client, { oldJti: 'old', newJti: 'new', userId: 'u1' });
      expect(result).toBe(true);
    });

    it('returns false when rowCount is 0 (already revoked or expired)', async () => {
      const client = makeClient();
      const result = await revokeForRotation(client, { oldJti: 'old', newJti: 'new', userId: 'u1' });
      expect(result).toBe(false);
    });

    it('passes oldJti, userId and revoked_at IS NULL guard in WHERE clause', async () => {
      const client = makeClient();
      await revokeForRotation(client, { oldJti: 'old', newJti: 'new', userId: 'u1' });
      const [sql, params] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('revoked_at IS NULL');
      expect(sql).toContain('expires_at > now()');
      expect(params).toContain('old');
      expect(params).toContain('u1');
    });
  });

  describe('findMetadata', () => {
    it('returns null when no row found', async () => {
      const client = makeClient();
      const result = await findMetadata(client, { jti: 'jti-1', userId: 'u1' });
      expect(result).toBeNull();
    });

    it('returns revokedReason and expiresAt when row exists', async () => {
      const client = makeClient({
        query: jest.fn<pg.Pool['query']>().mockResolvedValue({
          rows: [{ revoked_reason: 'rotated', expires_at: NOW }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        }),
      } as Partial<pg.Pool>);
      const result = await findMetadata(client, { jti: 'jti-1', userId: 'u1' });
      expect(result).toEqual({ revokedReason: 'rotated', expiresAt: NOW });
    });

    it('returns revokedReason=null for an active (non-revoked) token', async () => {
      const client = makeClient({
        query: jest.fn<pg.Pool['query']>().mockResolvedValue({
          rows: [{ revoked_reason: null, expires_at: NOW }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        }),
      } as Partial<pg.Pool>);
      const result = await findMetadata(client, { jti: 'jti-1', userId: 'u1' });
      expect(result?.revokedReason).toBeNull();
    });
  });

  describe('revokeForLogout', () => {
    it('returns null when rowCount is 0 (already revoked — idempotent)', async () => {
      const client = makeClient();
      const result = await revokeForLogout(client, { jti: 'jti-1', userId: 'u1' });
      expect(result).toBeNull();
    });

    it('returns { rotatedToJti: null } for a leaf token', async () => {
      const client = makeClient({
        query: jest.fn<pg.Pool['query']>().mockResolvedValue({
          rows: [{ rotated_to_jti: null }],
          rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
        }),
      } as Partial<pg.Pool>);
      const result = await revokeForLogout(client, { jti: 'jti-1', userId: 'u1' });
      expect(result).toEqual({ rotatedToJti: null });
    });

    it('returns { rotatedToJti } when token was previously rotated', async () => {
      const client = makeClient({
        query: jest.fn<pg.Pool['query']>().mockResolvedValue({
          rows: [{ rotated_to_jti: 'jti-2' }],
          rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
        }),
      } as Partial<pg.Pool>);
      const result = await revokeForLogout(client, { jti: 'jti-1', userId: 'u1' });
      expect(result).toEqual({ rotatedToJti: 'jti-2' });
    });

    it('uses atomic UPDATE with revoked_at IS NULL guard', async () => {
      const client = makeClient();
      await revokeForLogout(client, { jti: 'jti-1', userId: 'u1' });
      const [sql] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('revoked_at IS NULL');
      expect(sql).toContain('RETURNING');
    });
  });

  describe('revokeChainForLogout', () => {
    it('returns number of rows updated', async () => {
      const client = makeClient({
        query: jest.fn<pg.Pool['query']>().mockResolvedValue({
          rows: [], rowCount: 3, command: 'UPDATE', oid: 0, fields: [],
        }),
      } as Partial<pg.Pool>);
      const count = await revokeChainForLogout(client, { startJti: 'jti-1', userId: 'u1' });
      expect(count).toBe(3);
    });

    it('uses WITH RECURSIVE CTE to follow rotation chain', async () => {
      const client = makeClient();
      await revokeChainForLogout(client, { startJti: 'jti-1', userId: 'u1' });
      const [sql] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/WITH RECURSIVE/i);
      expect(sql).toContain('rotated_to_jti');
    });

    it('returns 0 when no unrevoked tokens in chain', async () => {
      const client = makeClient();
      const count = await revokeChainForLogout(client, { startJti: 'jti-1', userId: 'u1' });
      expect(count).toBe(0);
    });
  });

  describe('revokeAllByUser', () => {
    it('updates all active tokens for the user with given reason', async () => {
      const client = makeClient({
        query: jest.fn<pg.Pool['query']>().mockResolvedValue({
          rows: [], rowCount: 5, command: 'UPDATE', oid: 0, fields: [],
        }),
      } as Partial<pg.Pool>);
      const count = await revokeAllByUser(client, { userId: 'u1', reason: 'reuse_detected' });
      expect(count).toBe(5);
      const [sql, params] = (client.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('revoked_at IS NULL');
      expect(params).toContain('reuse_detected');
      expect(params).toContain('u1');
    });

    it('returns 0 when user has no active tokens', async () => {
      const client = makeClient();
      const count = await revokeAllByUser(client, { userId: 'u1', reason: 'logout' });
      expect(count).toBe(0);
    });
  });
});

// Verify no test leaks between describe blocks
describe('query isolation', () => {
  let client: pg.Pool;
  beforeEach(() => { client = makeClient(); });

  it('each test gets a fresh mock client', async () => {
    await insert(client, { jti: 'x', userId: 'y', expiresAt: NOW });
    expect((client.query as jest.Mock).mock.calls).toHaveLength(1);
  });
});
