import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface Me {
  email: string;
  displayName: string | null;
  hasSeenOnboarding: boolean;
}

/** Initials from the display name (first letters of the first two words) or, failing that, the email local-part. */
export function initialsOf(me: Me | null): string {
  if (!me) return '';
  const source = me.displayName?.trim() || me.email.split('@')[0] || '';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiClient
      .get<Me>('/me')
      .then(setMe)
      .catch(() => {
        // best-effort: header still renders without the profile
      });
  }, []);

  return me;
}
