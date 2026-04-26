import type { ZodType, ZodTypeDef } from 'zod';

export class FetcherError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string,
    public readonly tokenExpired: boolean,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FetcherError';
  }
}

interface BffErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
}

export interface FetcherOptions<T> extends Omit<RequestInit, 'signal'> {
  schema?: ZodType<T, ZodTypeDef, unknown>;
  signal?: AbortSignal;
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function assertSameOriginPath(path: string): void {
  if (!path.startsWith('/api/')) {
    throw new Error(`fetcher: path must start with '/api/', got '${path}'`);
  }
}

export async function fetcher<T = unknown>(
  path: string,
  options: FetcherOptions<T> = {},
): Promise<T> {
  assertSameOriginPath(path);

  const { schema, headers: initHeaders, ...rest } = options;
  const requestId = generateRequestId();
  const headers = new Headers(initHeaders);
  headers.set('X-Request-Id', requestId);
  if (rest.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...rest,
    headers,
    credentials: 'same-origin',
  });

  const tokenExpired = response.headers.get('X-Token-Expired') === 'true';

  if (response.status === 204) {
    return undefined as T;
  }

  const rawText = await response.text();
  let payload: unknown = undefined;
  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      throw new FetcherError(
        response.status,
        'INVALID_JSON',
        'Response body was not valid JSON',
        requestId,
        tokenExpired,
      );
    }
  }

  if (!response.ok) {
    const envelope = payload as BffErrorEnvelope | undefined;
    const err = envelope?.error;
    if (response.status === 401 && typeof window !== 'undefined') {
      void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
        window.location.href = '/login?reason=session_expired';
      });
    }
    throw new FetcherError(
      response.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? response.statusText,
      err?.requestId ?? requestId,
      tokenExpired,
      err?.details,
    );
  }

  if (schema) {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new FetcherError(
        502,
        'CLIENT_CONTRACT_VIOLATION',
        'Response failed client-side schema validation',
        requestId,
        false,
        parsed.error.issues,
      );
    }
    return parsed.data;
  }

  return payload as T;
}

export async function postJson<T = unknown>(
  path: string,
  body: unknown,
  options: FetcherOptions<T> = {},
): Promise<T> {
  return fetcher<T>(path, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
}

export async function patchJson<T = unknown>(
  path: string,
  body: unknown,
  options: FetcherOptions<T> = {},
): Promise<T> {
  return fetcher<T>(path, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(body ?? {}),
  });
}
