'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAuthSession } from '@/hooks/useAuthSession';

/**
 * Marketing content now lives on mister-wallet.com (separate Astro repo).
 * This route only exists so old bookmarks/links to app.mister-wallet.com/[locale]
 * land somewhere useful. No server-side session check is available here: the
 * refresh-token cookie is scoped to the API's own origin (see auth.controller.ts),
 * so we resolve the session client-side via the existing useAuthSession hook.
 */
export default function HomePage() {
  const router = useRouter();
  const session = useAuthSession();

  useEffect(() => {
    if (session === 'loading') return;
    router.replace(session === 'authenticated' ? '/accounts' : '/login');
  }, [session, router]);

  return null;
}
