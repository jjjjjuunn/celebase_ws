import { z } from 'zod';
import { toBffErrorResponse, type BffError } from '../bff-error';

async function parseResponse(res: Response): Promise<unknown> {
  return res.json();
}

describe('toBffErrorResponse', () => {
  describe('BffError passthrough', () => {
    it('returns the status from BffError', async () => {
      const err: BffError = {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: 'req-001',
      };
      const res = toBffErrorResponse(err, 'req-001');
      expect(res.status).toBe(404);
    });

    it('keeps allowlisted fields: code, message, requestId', async () => {
      const err: BffError = {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Bad input',
        requestId: 'req-002',
      };
      const body = await parseResponse(toBffErrorResponse(err, 'req-002'));
      expect(body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Bad input', requestId: 'req-002' } });
    });

    it('passes through retryable and retry_after', async () => {
      const err: BffError = {
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        requestId: 'req-003',
        retryable: true,
        retry_after: 30,
      };
      const body = await parseResponse(toBffErrorResponse(err, 'req-003')) as { error: Record<string, unknown> };
      expect(body.error['retryable']).toBe(true);
      expect(body.error['retry_after']).toBe(30);
    });

    it('strips stack from hostile payload', async () => {
      const err: BffError = {
        status: 502,
        code: 'UPSTREAM_ERROR',
        message: 'Upstream failed',
        requestId: 'req-004',
        ...(({ stack: 'at foo.js:10' } as unknown) as object),
      } as BffError;
      const body = await parseResponse(toBffErrorResponse(err, 'req-004')) as { error: Record<string, unknown> };
      expect(body.error['stack']).toBeUndefined();
      expect(body.error['stacktrace']).toBeUndefined();
    });

    it('passes details with field and issue', async () => {
      const err: BffError = {
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'Invalid fields',
        requestId: 'req-005',
        details: [{ field: 'email', issue: 'Must be a valid email address' }],
      };
      const body = await parseResponse(toBffErrorResponse(err, 'req-005')) as { error: { details: unknown[] } };
      expect(body.error.details).toEqual([{ field: 'email', issue: 'Must be a valid email address' }]);
    });

    it('PHI-redacts biomarkers inside details[].meta', async () => {
      const err: BffError = {
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'PHI in meta',
        requestId: 'req-006',
        details: [{
          issue: 'bad value',
          meta: {
            hint: 'Check your input',
            biomarkers: { glucose: 120 },
            medical_conditions: ['diabetes'],
            safe_field: 'ok',
          },
        }],
      };
      const body = await parseResponse(toBffErrorResponse(err, 'req-006')) as {
        error: { details: Array<{ meta: Record<string, unknown> }> }
      };
      const meta = body.error.details[0]?.meta;
      expect(meta?.['biomarkers']).toBe('[REDACTED]');
      expect(meta?.['medical_conditions']).toBe('[REDACTED]');
      expect(meta?.['safe_field']).toBe('ok');
      expect(meta?.['hint']).toBe('Check your input');
    });
  });

  describe('ZodError → 502 BFF_CONTRACT_VIOLATION', () => {
    it('emits 502 with BFF_CONTRACT_VIOLATION code', async () => {
      const zodErr = z.object({ id: z.string() }).safeParse({ id: 42 });
      expect(zodErr.success).toBe(false);
      const err = zodErr.success ? null : zodErr.error;
      if (!err) throw new Error('expected ZodError');

      const res = toBffErrorResponse(err, 'req-007');
      expect(res.status).toBe(502);
      const body = await parseResponse(res) as { error: { code: string } };
      expect(body.error.code).toBe('BFF_CONTRACT_VIOLATION');
    });

    it('does not leak ZodError issues in response body', async () => {
      const zodErr = z.object({ secret: z.string().min(8) }).safeParse({ secret: 'x' });
      expect(zodErr.success).toBe(false);
      const err = zodErr.success ? null : zodErr.error;
      if (!err) throw new Error('expected ZodError');

      const body = await parseResponse(toBffErrorResponse(err!, 'req-008')) as { error: Record<string, unknown> };
      expect(body.error['issues']).toBeUndefined();
      expect(body.error['errors']).toBeUndefined();
    });
  });

  describe('unknown error → 500 INTERNAL_ERROR', () => {
    it('returns 500 for generic Error', async () => {
      const res = toBffErrorResponse(new Error('something exploded'), 'req-009');
      expect(res.status).toBe(500);
      const body = await parseResponse(res) as { error: { code: string } };
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('does not leak error message in response body', async () => {
      const res = toBffErrorResponse(new Error('DB password is hunter2'), 'req-010');
      const body = await parseResponse(res) as { error: { message: string } };
      expect(body.error.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('hunter2');
    });

    it('returns 500 for null thrown value', async () => {
      const res = toBffErrorResponse(null, 'req-011');
      expect(res.status).toBe(500);
    });
  });

  describe('x-request-id header', () => {
    it('includes X-Request-Id in response headers', () => {
      const err: BffError = { status: 400, code: 'BAD', message: 'x', requestId: 'hdr-001' };
      const res = toBffErrorResponse(err, 'hdr-001');
      expect(res.headers.get('X-Request-Id')).toBe('hdr-001');
    });
  });
});
