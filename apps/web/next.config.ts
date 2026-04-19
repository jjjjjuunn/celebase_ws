import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? '';

// Sprint A CSP: dev permits unsafe-inline + unsafe-eval (Next.js HMR).
// TODO(Sprint B): replace with nonce-based strict CSP via middleware-injected nonce.
const cspDirectives = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${wsUrl}`.trim(),
  isProd
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  isProd ? "style-src 'self'" : "style-src 'self' 'unsafe-inline'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives.join('; ') },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@celebbase/ui-kit', '@celebbase/design-tokens'],
  typedRoutes: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
