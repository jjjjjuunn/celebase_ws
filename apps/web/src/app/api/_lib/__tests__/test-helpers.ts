// Shared BFF integration test utilities. Imported by *.integration.test.ts
// and session.test.ts. Filename omits `.test.` on purpose — jest.config.cjs
// `testMatch` is `*.test.ts` so this file is not collected as a suite.

import type { NextRequest } from 'next/server';

export const VALID_SESSION_PAYLOAD = {
  sub: 'user-abc-123',
  email: 'test@example.com',
  cognito_sub: 'cognito-sub-xyz',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

export interface MakeRequestOpts {
  cookie?: string;
  refreshCookie?: string;
  requestId?: string;
  forwardedFor?: string;
  search?: string;
  body?: unknown;
  // Raw `Authorization` header value (e.g. `'Bearer eyJ...'`). Pass without a
  // scheme prefix to test scheme-mismatch rejection (case-insensitive get is
  // expected from NextRequest.headers).
  authorization?: string;
}

// Minimal NextRequest-shaped mock — only the fields createProtectedRoute /
// route handlers use. Mirrors session.test.ts:makeRequest but adds body,
// nextUrl.search, and x-forwarded-for support for route integration tests.
export function makeRequest(
  opts?: MakeRequestOpts,
): NextRequest {
  const bodyText = opts?.body === undefined
    ? ''
    : typeof opts.body === 'string'
      ? opts.body
      : JSON.stringify(opts.body);
  return {
    headers: {
      get(name: string): string | null {
        const lower = name.toLowerCase();
        if (lower === 'x-request-id') return opts?.requestId ?? null;
        if (lower === 'x-forwarded-for') return opts?.forwardedFor ?? null;
        if (lower === 'authorization') return opts?.authorization ?? null;
        return null;
      },
    },
    cookies: {
      get(name: string): { value: string } | undefined {
        if (name === 'cb_access')
          return opts?.cookie !== undefined ? { value: opts.cookie } : undefined;
        if (name === 'cb_refresh')
          return opts?.refreshCookie !== undefined
            ? { value: opts.refreshCookie }
            : undefined;
        return undefined;
      },
    },
    nextUrl: {
      search: opts?.search ?? '',
    },
    json: async (): Promise<unknown> => {
      if (bodyText === '') return {};
      return JSON.parse(bodyText) as unknown;
    },
  } as unknown as NextRequest;
}

// Minimal upstream Response factory. Mirrors fetchBff's expectations:
// JSON body + content-type application/json.
export function upstreamResponse(
  body: unknown,
  status: number = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(extraHeaders ?? {}) },
  });
}

// jose mock factory — keeps the JWTExpired / JWSSignatureVerificationFailed
// classes consistent across integration test files so `instanceof` checks in
// session.ts resolve correctly.
export interface JoseErrorClasses {
  JWTExpired: new (message?: string) => Error;
  JWSSignatureVerificationFailed: new (message?: string) => Error;
}

export function makeJoseErrors(): JoseErrorClasses {
  class JWTExpired extends Error {
    public code = 'ERR_JWT_EXPIRED';
    constructor(message = 'JWT expired') {
      super(message);
      this.name = 'JWTExpired';
    }
  }
  class JWSSignatureVerificationFailed extends Error {
    public code = 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';
    constructor(message = 'signature verification failed') {
      super(message);
      this.name = 'JWSSignatureVerificationFailed';
    }
  }
  return { JWTExpired, JWSSignatureVerificationFailed };
}
