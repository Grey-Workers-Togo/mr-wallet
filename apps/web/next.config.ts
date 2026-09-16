import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // This repo already has a hand-written CLAUDE.md with project rules; don't let
  // Next auto-generate a second, conflicting one in apps/web.
  agentRules: false,
};

export default withNextIntl(nextConfig);
