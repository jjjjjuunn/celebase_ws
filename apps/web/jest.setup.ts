process.env['INTERNAL_JWT_SECRET'] = 'ci-dev-secret-not-for-prod';
process.env['INTERNAL_JWT_ISSUER'] = 'celebbase-user-service';
process.env['USER_SERVICE_URL'] = 'http://localhost:3001';
process.env['CONTENT_SERVICE_URL'] = 'http://localhost:3002';
process.env['MEAL_PLAN_URL'] = 'http://localhost:3003';
process.env['LOG_LEVEL'] = 'silent';
process.env['COGNITO_HOSTED_UI_DOMAIN'] = 'test.auth.us-east-1.amazoncognito.com';
process.env['COGNITO_CLIENT_ID'] = 'test-client-id';
process.env['COGNITO_CLIENT_SECRET'] = 'test-client-secret';
process.env['COGNITO_REDIRECT_URI'] = 'http://localhost:3000/api/auth/callback';
process.env['COGNITO_TOKEN_ENDPOINT'] = 'https://test.auth.us-east-1.amazoncognito.com/oauth2/token';

// WebSocket — not available in Node. Minimal stub so hook-under-test code
// that references typeof WebSocket doesn't throw at import time.
if (typeof (globalThis as Record<string, unknown>)['WebSocket'] === 'undefined') {
  (globalThis as Record<string, unknown>)['WebSocket'] = class MockWebSocket {
    static CONNECTING = 0 as const;
    static OPEN = 1 as const;
    static CLOSING = 2 as const;
    static CLOSED = 3 as const;
    readyState = 0;
    url: string;
    constructor(url: string, _protocols?: string | string[]) { this.url = url; }
    close(_code?: number, _reason?: string): void { this.readyState = 3; }
    send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {}
    addEventListener(_type: string, _listener: EventListenerOrEventListenerObject): void {}
    removeEventListener(_type: string, _listener: EventListenerOrEventListenerObject): void {}
    dispatchEvent(_event: Event): boolean { return true; }
  };
}

// location — not available in Node. Writable stub so hooks can set
// window.location.href without throwing.
if (typeof (globalThis as Record<string, unknown>)['location'] === 'undefined') {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: {
      href: 'http://localhost:3000/',
      origin: 'http://localhost:3000',
      pathname: '/',
      search: '',
      hash: '',
      assign(_url: string): void {},
      replace(_url: string): void {},
      reload(): void {},
    },
  });
}
