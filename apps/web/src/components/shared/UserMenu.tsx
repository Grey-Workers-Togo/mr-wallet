'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings, LogOut } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useMe, initialsOf } from '@/hooks/useMe';
import { cn } from '@/lib/utils';

export function UserMenu({ onLogout }: { onLogout: () => void }) {
  const t = useTranslations('nav');
  const me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = initialsOf(me) || '·';
  const displayName = me?.displayName?.trim() || me?.email?.split('@')[0] || '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={displayName || 'Profil'}
        className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-1 ring-primary/20 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#141418]"
        >
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-white/10">
            {displayName && (
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{displayName}</p>
            )}
            <p className="truncate text-xs text-neutral-500">{me?.email ?? '…'}</p>
          </div>
          <div className="p-1">
            <Link
              href="/preferences"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/5"
            >
              <Settings aria-hidden className="size-4" />
              {t('preferences')}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10',
              )}
            >
              <LogOut aria-hidden className="size-4" />
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
