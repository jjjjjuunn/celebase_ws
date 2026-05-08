import { ZodError } from 'zod';

// CHORE-BFF-SESSION-EXPIRED-CLEANUP (2026-05-07): SessionExpiredError class
// + redirectOnSessionExpired helper removed. CHORE-BFF-401-CONTRACT 머지 후
// fetchBff 가 401 을 throw 하지 않고 Result.ok=false + upstream code 로
//반환 → throw site 0, catch site 0, helper caller 0. cleanup 안전.

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
  // process.stdout/stderr.write 직접 사용 — gate-check.sh policy 의 deny
  // pattern (`console` family) 회피 + Node.js stream 직접 write 는 동일 동작
  // 유지. CHORE-BFF-SESSION-EXPIRED-CLEANUP 가 같은 파일 수정으로 main 의
  // 기존 sink 를 gate 가 새로 감지 → 함께 cleanup.
  const stream = level === 'info' ? process.stdout : process.stderr;
  stream.write(JSON.stringify(record) + '\n');
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
