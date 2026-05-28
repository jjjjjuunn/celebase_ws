import { jest, describe, it, expect } from '@jest/globals';

// Mock the SDK so we can assert wiring without a real DSN / network.
const mockInit = jest.fn<(opts: Record<string, unknown>) => void>();
const mockCapture = jest.fn<(e: unknown) => void>();
jest.unstable_mockModule('@sentry/node', () => ({
  init: mockInit,
  captureException: mockCapture,
}));

const { initSentry, captureException, isSentryInitialized } = await import('../../src/sentry.js');

const EMAIL = 'leak@phi.example';

// NOTE: `initialized` is module-global; tests run in sequence and assert the
// real state progression (no DSN → DSN → repeat).
describe('initSentry / captureException', () => {
  it('is a no-op without a DSN (fail-open) — init never called, capture no-ops', () => {
    initSentry('user-service', undefined, 'test');
    initSentry('user-service', '', 'test');
    captureException(new Error('before init'));
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(isSentryInitialized()).toBe(false);
  });

  it('initializes once with a DSN and wires a PHI-scrubbing beforeSend', () => {
    initSentry('user-service', 'https://abc@o0.ingest.sentry.io/1', 'production');
    expect(mockInit).toHaveBeenCalledTimes(1);
    const opts = mockInit.mock.calls[0]?.[0];
    expect(opts?.['tracesSampleRate']).toBe(0);
    expect(opts?.['sendDefaultPii']).toBe(false);
    const beforeSend = opts?.['beforeSend'] as (e: Record<string, unknown>) => Record<string, unknown> | null;
    const out = beforeSend({ message: `boom ${EMAIL}` });
    expect(JSON.stringify(out)).not.toContain(EMAIL);
    expect(isSentryInitialized()).toBe(true);
  });

  it('forwards captureException once initialized', () => {
    captureException(new Error('real'));
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('does not re-init on a second call (Sentry.init is process-global)', () => {
    initSentry('user-service', 'https://abc@o0.ingest.sentry.io/1', 'production');
    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});
