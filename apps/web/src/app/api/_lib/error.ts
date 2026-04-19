import pino from 'pino';
import { ZodError } from 'zod';

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

export function createLogger(moduleName: string): pino.Logger {
  const isDev = process.env['NODE_ENV'] !== 'production';
  const base: pino.LoggerOptions = {
    name: moduleName,
    level: process.env['LOG_LEVEL'] ?? 'info',
    redact: { paths: [...PHI_REDACT_PATHS], censor: '[REDACTED]' },
    serializers: { err: pino.stdSerializers.err },
  };
  if (isDev) {
    return pino({
      ...base,
      transport: { target: 'pino-pretty' },
    });
  }
  return pino(base);
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
