// Sentry (@sentry/react-native) init for the mobile client. Errors only (no
// perf tracing). Fail-open: no EXPO_PUBLIC_SENTRY_DSN → no init → no events
// (never crashes the app). All PHI/PII scrubbing lives in sentry-scrub.ts and
// runs in `beforeSend` before any event leaves the device.
//
// CHORE-SENTRY-PHI-REDACTION-001 (G2). Native crash symbolication additionally
// needs the `@sentry/react-native` Expo config plugin (gated in app.config.js)
// + a build-time auth token — see docs handoff.

import * as Sentry from '@sentry/react-native';

import { scrubEvent, type ScrubbableEvent } from './sentry-scrub';

let initialized = false;

/** Initialize Sentry. No-op without EXPO_PUBLIC_SENTRY_DSN and on repeat calls. */
export function initSentry(): void {
  const dsn: unknown = process.env['EXPO_PUBLIC_SENTRY_DSN'];
  if (initialized || typeof dsn !== 'string' || dsn === '') return;
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      try {
        return scrubEvent(event as unknown as ScrubbableEvent) as unknown as typeof event;
      } catch {
        return null; // fail-safe: drop on scrub error rather than risk a leak
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
