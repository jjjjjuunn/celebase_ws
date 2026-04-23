// Status-preserving raw forwarder for routes that must relay upstream
// bytes verbatim (e.g. Stripe webhooks — signature verification requires
// the exact body bytes, and Stripe retry logic depends on the upstream's
// HTTP status). fetchBff wraps errors into Result<T> and collapses
// non-2xx into BffError; this helper keeps the upstream status intact.
//
// No rate limiting. Webhook retry bursts (Stripe up to 3 days, 5s initial
// interval) must not be blocked by the public-route bucket.
//
// SSRF guard: `path` MUST be a static string constant — never derived from
// user input. baseUrlFor() resolves the target via env vars, so the host
// is always an internal allowlisted service.

import type { BffTarget } from './bff-fetch.js';
import { baseUrlFor } from './bff-fetch.js';
import { createLogger } from './bff-error.js';

const log = createLogger('bff-forward-raw');

const DEFAULT_TIMEOUT_MS = 10_000;

export interface ForwardRawOptions {
  target: BffTarget;
  path: string;
  method: 'POST';
  rawBody: string;
  headers: Record<string, string>;
  requestId: string;
  timeoutMs?: number;
}

export interface ForwardRawResult {
  status: number;
  contentType: string;
  body: string;
}

export async function forwardRaw(
  opts: ForwardRawOptions,
): Promise<ForwardRawResult> {
  const { target, path, method, rawBody, headers, requestId, timeoutMs } = opts;
  const url = `${baseUrlFor(target)}${path}`;
  const signal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const mergedHeaders: Record<string, string> = {
    ...headers,
    'X-Request-Id': requestId,
  };

  const response = await fetch(url, {
    method,
    headers: mergedHeaders,
    body: rawBody,
    signal,
  }).catch((err: unknown) => {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return { __err: 'timeout' as const };
    }
    log.warn({ err, target, path }, 'raw forward failed');
    return { __err: 'network' as const };
  });

  if ('__err' in response) {
    const status = response.__err === 'timeout' ? 504 : 502;
    const code =
      response.__err === 'timeout' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE';
    return {
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code,
          message:
            code === 'UPSTREAM_TIMEOUT'
              ? 'Upstream service timeout'
              : 'Upstream service unreachable',
          requestId,
        },
      }),
    };
  }

  const body = await response.text().catch(() => '');
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/json',
    body,
  };
}
