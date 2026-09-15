import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Lint already runs as its own CI/DoD step (`npm run lint`, root-hoisted eslint) — Next's
  // build-time ESLint check fails on Vercel because eslint isn't resolvable from apps/web alone.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);
