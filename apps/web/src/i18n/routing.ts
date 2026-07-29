import { defineRouting } from 'next-intl/routing';

// ADR-0009: fr and en supported from day one, both mandatory in CI.
export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
});
