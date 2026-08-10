'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { Flag } from '@/components/shared/Flag';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function onToggle() {
    const nextLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;
    router.push(pathname, { locale: nextLocale });
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t('switchLanguage')}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-white',
        className,
      )}
    >
      <Flag locale={locale} className="h-3.5 w-5" />
      {locale.toUpperCase()}
    </button>
  );
}
