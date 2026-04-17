import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@celebbase/ui-kit', '@celebbase/design-tokens'],
  typedRoutes: true,
};

export default nextConfig;
