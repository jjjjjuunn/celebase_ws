import { z } from 'zod';
import { fetchBff, resetRateLimitBucketsForTest } from '../bff-fetch';
import type { BffError } from '../bff-error';

function upstreamErrorResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchBff — upstream error details forwarding', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRateLimitBucketsForTest();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function callWith(body: unknown, status: number): Promise<BffError> {
    fetchSpy.mockResolvedValue(upstreamErrorResponse(body, status));
    const result = await fetchBff('user', '/users/me/bio-profile', {
      method: 'POST',
      schema: z.unknown(),
      requestId: `req-${String(Math.random())}`,
      userId: `user-${String(Math.random())}`,
    });
    if (result.ok) throw new Error('expected error result');
    return result.error;
  }

  it('forwards well-formed validation details (field + issue)', async () => {
    const error = await callWith(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'weight_kg', issue: 'Number must be greater than 0' },
            { field: 'birth_year', issue: 'Required' },
          ],
        },
      },
      400,
    );

    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([
      { field: 'weight_kg', issue: 'Number must be greater than 0' },
      { field: 'birth_year', issue: 'Required' },
    ]);
  });

  it('forwards an issue-only detail and preserves a plain-object meta', async () => {
    const error = await callWith(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid',
          details: [{ issue: 'bad value', meta: { hint: 'try again' } }],
        },
      },
      422,
    );

    expect(error.details).toEqual([
      { issue: 'bad value', meta: { hint: 'try again' } },
    ]);
  });

  it('drops malformed detail items but keeps valid ones', async () => {
    const error = await callWith(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid',
          details: [
            { field: 'email' }, // no issue → dropped
            { issue: 42 }, // non-string issue → dropped
            { issue: 'ok', meta: ['not', 'an', 'object'] }, // array meta → meta dropped, item kept
            { field: 'name', issue: 'Required' }, // valid
          ],
        },
      },
      400,
    );

    expect(error.details).toEqual([
      { issue: 'ok' },
      { field: 'name', issue: 'Required' },
    ]);
  });

  it('omits details when upstream provides a non-array', async () => {
    const error = await callWith(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid',
          details: 'not-an-array',
        },
      },
      400,
    );

    expect(error.details).toBeUndefined();
  });

  it('omits details when upstream provides none', async () => {
    const error = await callWith(
      { error: { code: 'NOT_FOUND', message: 'Resource not found' } },
      404,
    );

    expect(error.code).toBe('NOT_FOUND');
    expect(error.details).toBeUndefined();
  });

  it('omits details when all items are malformed', async () => {
    const error = await callWith(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid',
          details: [{ field: 'x' }, { issue: true }],
        },
      },
      400,
    );

    expect(error.details).toBeUndefined();
  });
});
