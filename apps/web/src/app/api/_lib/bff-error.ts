import { ZodError } from 'zod';

// Thrown by fetchBff on server-side BE 401 (RSC or API-route-handler
// context). See redirectOnSessionExpired() in bff-fetch.ts + catch logic in
// session.ts (createProtectedRoute returns 401 JSON, RSCs call the helper to
// redirect). Lives in bff-error.ts to break the session.ts ↔ bff-fetch.ts
// import cycle.
export class SessionExpiredError extends Error {
  public readonly code = 'SESSION_EXPIRED' as const;
  public readonly returnTo: string | undefined;
  constructor(returnTo?: string) {
    super('Session expired');
    this.name = 'SessionExpiredError';
    this.returnTo = returnTo;
  }
}

export interface BffErrorDetail {
  field?: string;
  issue: string;
  meta?: Record<string, unknown>;
}

export interface BffError {
  status: number;
  code: string;
  message: string;
  requestId: string;
  retryable?: boolean;
  retry_after?: number;
  details?: BffErrorDetail[];
}

export const PHI_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.authorization',
  '*.cookie',
  '*.access_token',
  '*.refresh_token',
  '*.biomarkers',
  '*.height',
  '*.height_cm',
  '*.weight',
  '*.weight_kg',
  '*.body_fat_pct',
  '*.medical_conditions',
  '*.medications',
  '*.allergies',
  'DATABASE_URL',
  '*.intolerances',
  '*.id_token',
];

export interface BffLogger {
  info: (payload: Record<string, unknown>, msg?: string) => void;
  warn: (payload: Record<string, unknown>, msg?: string) => void;
  error: (payload: Record<string, unknown>, msg?: string) => void;
}

function emit(
  level: 'info' | 'warn' | 'error',
  moduleName: string,
  payload: Record<string, unknown>,
  msg?: string,
): void {
  const record = {
    level,
    time: new Date().toISOString(),
    name: moduleName,
    msg: msg ?? '',
    ...redactPhi(payload),
  };
  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(JSON.stringify(record));
}

export function createLogger(moduleName: string): BffLogger {
  return {
    info: (payload, msg) => emit('info', moduleName, payload, msg),
    warn: (payload, msg) => emit('warn', moduleName, payload, msg),
    error: (payload, msg) => emit('error', moduleName, payload, msg),
  };
}

export function isBffError(value: unknown): value is BffError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    'status' in v &&
    'code' in v &&
    'message' in v &&
    'requestId' in v &&
    typeof v.code === 'string' &&
    typeof v.message === 'string' &&
    typeof v.requestId === 'string' &&
    typeof v.status === 'number'
  );
}

const WILDCARD_KEYS: readonly string[] = PHI_REDACT_PATHS
  .filter((p) => p.startsWith('*.'))
  .map((p) => p.slice(2));

const LITERAL_KEYS: readonly string[] = PHI_REDACT_PATHS.filter(
  (p) => !p.includes('.') && !p.startsWith('*'),
);

function redactPhi(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (input === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (WILDCARD_KEYS.includes(key) || LITERAL_KEYS.includes(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactPhi(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function filterBffError(err: BffError): Record<string, unknown> {
  const filtered: Record<string, unknown> = {
    code: err.code,
    message: err.message,
    requestId: err.requestId,
  };
  if (err.retryable !== undefined) filtered['retryable'] = err.retryable;
  if (err.retry_after !== undefined) filtered['retry_after'] = err.retry_after;
  if (err.details !== undefined) {
    filtered['details'] = err.details.map((d) => {
      const detail: Record<string, unknown> = { issue: d.issue };
      if (d.field !== undefined) detail['field'] = d.field;
      if (d.meta !== undefined) detail['meta'] = redactPhi(d.meta);
      return detail;
    });
  }
  return filtered;
}

function jsonResponse(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  });
}

export function toBffErrorResponse(err: unknown, requestId: string): Response {
  if (isBffError(err)) {
    return jsonResponse({ error: filterBffError(err) }, err.status, requestId);
  }
  if (err instanceof ZodError) {
    const log = createLogger('bff-error');
    log.error({ zodError: err.issues }, 'Upstream contract violation');
    return jsonResponse(
      {
        error: {
          code: 'BFF_CONTRACT_VIOLATION',
          message: 'Upstream response failed schema validation',
          requestId,
        },
      },
      502,
      requestId,
    );
  }
  const log = createLogger('bff-error');
  log.error({ err }, 'Unhandled error in BFF route');
  return jsonResponse(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId,
      },
    },
    500,
    requestId,
  );
}
