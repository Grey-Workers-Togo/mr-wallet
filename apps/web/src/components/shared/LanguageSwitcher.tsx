'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LanguageSwitcher() {
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
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
    >
      <Languages size={18} aria-hidden="true" />
      {locale.toUpperCase()}
    </button>
  );
}
