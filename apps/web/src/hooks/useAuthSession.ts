'use client';

import { useEffect, useState } from 'react';
import { checkSession } from '@/lib/api-client';

export type AuthSessionStatus = 'loading' | 'authenticated' | 'guest';

/** Silently tries the refresh cookie on mount to know if a session exists (access token is memory-only, lost on reload). */
export function useAuthSession(): AuthSessionStatus {
  const [status, setStatus] = useState<AuthSessionStatus>('loading');

  useEffect(() => {
    let active = true;
    checkSession().then((ok) => {
      if (active) setStatus(ok ? 'authenticated' : 'guest');
    });
    return () => {
      active = false;
    };
  }, []);

  return status;
}
