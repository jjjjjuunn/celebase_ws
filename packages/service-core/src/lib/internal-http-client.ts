import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { CircuitBreaker } from "./circuit-breaker.js";

export interface InternalClientOptions {
  baseUrl: string;
  secret: string;
  issuer?: string;
  audience: string;
  timeoutMs?: number;
  retries?: number;
  circuitBreaker?: CircuitBreaker;
}

export interface InternalClient {
  post<TResponse>(
    path: string,
    body: unknown,
    opts?: { idempotencyKey?: string },
  ): Promise<TResponse>;

  get<TResponse>(
    path: string,
    opts?: { query?: Record<string, string> },
  ): Promise<TResponse>;
}

const DEFAULT_ISSUER = "celebbase-internal";
const DEFAULT_TIMEOUT = 3000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => { controller.abort(); }, timeoutMs);
  try {
    const response: Response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

export function createInternalClient(opts: InternalClientOptions): InternalClient {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const issuer = opts.issuer ?? DEFAULT_ISSUER;
  const breaker =
    opts.circuitBreaker ??
    new CircuitBreaker({ name: "internal-http-client", threshold: 5, timeoutMs: 60_000 });

  function buildJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const secretKey = new TextEncoder().encode(opts.secret);
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 60)
      .setIssuer(issuer)
      .setAudience(opts.audience)
      .setJti(uuidv7())
      .sign(secretKey);
  }

  async function doRequest<T>(
    method: string,
    path: string,
    body: unknown,
    extraHeaders: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, opts.baseUrl);
    const attemptMax = retries + 1;
    let attempt = 0;
    let lastErr: unknown;

    while (attempt < attemptMax) {
      attempt += 1;
      try {
        const token = await buildJwt();
        const headers: Record<string, string> = {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          ...extraHeaders,
        };

        const reqInit: RequestInit = {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        };

        const fetchFn = () => fetchWithTimeout(url, reqInit, timeout);
        const response = await breaker.execute(fetchFn);

        if (response.status >= 500) {
          if (attempt <= retries) {
            await sleep(3000 * attempt); // 3s, 6s backoff
            continue;
          }
          throw new Error(`InternalClientError: ${String(response.status)} ${path}`);
        }
        if (response.status >= 400) {
          throw new Error(`InternalClientError: ${String(response.status)} ${path}`);
        }

        const data = (await response.json()) as T;
        return data;
      } catch (err) {
        // Circuit breaker open or network error
        if (
          (err instanceof Error && err.message.startsWith("circuit breaker open")) ||
          err instanceof DOMException ||
          err instanceof TypeError
        ) {
          if (attempt <= retries) {
            await sleep(3000 * attempt);
            lastErr = err;
            continue;
          }
        }
        throw err;
      }
    }
    throw lastErr instanceof Error
      ? new Error("InternalClientError: " + lastErr.message)
      : new Error("InternalClientError: unknown");
  }

  return {
    async post(path, body, opts2) {
      const extraHeaders: Record<string, string> = {};
      if (opts2?.idempotencyKey) {
        extraHeaders["Idempotency-Key"] = opts2.idempotencyKey;
      }
      return doRequest("POST", path, body, extraHeaders);
    },

    async get(path, opts2) {
      const query = opts2?.query ?? {};
      const urlPath = new URL(path, opts.baseUrl);
      for (const [k, v] of Object.entries(query)) {
        urlPath.searchParams.append(k, v);
      }
      return doRequest("GET", urlPath.pathname + urlPath.search, undefined, {});
    },
  };
}

