'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';
import { AppShell } from './AppShell';

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/account-deletion',
]);

export function ConditionalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC_PATHS.has(pathname)) {
    return <>{children}</>;
  }
  return <AppShell>{children}</AppShell>;
}
