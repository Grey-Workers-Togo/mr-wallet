'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/shared/Logo';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useAuthSession } from '@/hooks/useAuthSession';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  const t = useTranslations('home');
  const [scrolled, setScrolled] = useState(false);
  const session = useAuthSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300',
        scrolled
          ? 'border-b border-neutral-200 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0a0a0d]/80'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link href="/" aria-label="Mr Wallet" className="shrink-0">
          <Logo size={30} textClassName="text-neutral-900 dark:text-white" />
        </Link>

        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          {session === 'authenticated' ? (
            <Link
              href="/accounts"
              className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {t('myAccount')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          ) : session === 'guest' ? (
            <>
              <Link
                href="/login"
                className="ml-1 hidden rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:inline-flex dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                {t('login')}
              </Link>
              <Link
                href="/register"
                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {t('register')}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
