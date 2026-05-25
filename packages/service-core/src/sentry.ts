// Thin Sentry (@sentry/node) wiring for all TS services. Errors-only (no perf
// tracing). Fail-open: no DSN → no init → no events (never crashes the service).
// All PHI/PII scrubbing lives in sentry-scrub.ts and runs in `beforeSend`.
//
// CHORE-SENTRY-PHI-REDACTION-001 + CHORE-OBSERVABILITY-001 (G2/G3).

import * as Sentry from '@sentry/node';

import { scrubSentryEvent, type ScrubbableEvent } from './sentry-scrub.js';

let initialized = false;

/**
 * Initialize Sentry for a service. No-op when `dsn` is undefined/empty (the
 * launch default until the user provisions a Sentry project + DSN), and a no-op
 * on repeat calls (Sentry.init is process-global).
 */
export function initSentry(serviceName: string, dsn: string | undefined, environment: string): void {
  if (initialized || dsn === undefined || dsn === '') return;
  Sentry.init({
    dsn,
    environment,
    // Errors only — no performance/tracing spend (CHORE-OBSERVABILITY-001 lean default).
    tracesSampleRate: 0,
    // Belt-and-suspenders with beforeSend: do not auto-attach IP/cookies/headers.
    sendDefaultPii: false,
    beforeSend(event) {
      try {
        return scrubSentryEvent(event as unknown as ScrubbableEvent, {
          idSalt: serviceName,
        }) as unknown as typeof event;
      } catch {
        // Fail-safe: if scrubbing throws, drop the event rather than risk a leak.
        return null;
      }
    },
  });
  initialized = true;
}

/** Capture an exception if Sentry is initialized; otherwise a no-op. */
export function captureException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}

/** Test/diagnostic hook. */
export function isSentryInitialized(): boolean {
  return initialized;
}
