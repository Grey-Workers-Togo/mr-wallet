'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Globe2, BookOpenCheck, Smartphone } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

const MARKETING_SITE_URL = 'https://mister-wallet.com';

export function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('authLayout');
  const locale = useLocale();
  const marketingHref = `${MARKETING_SITE_URL}/${locale}`;

  const points = [
    { icon: Globe2, label: t('trust.multiCurrencyTitle'), desc: t('trust.multiCurrencyDescription') },
    { icon: BookOpenCheck, label: t('trust.ledgerTitle'), desc: t('trust.ledgerDescription') },
    { icon: Smartphone, label: t('trust.mobileTitle'), desc: t('trust.mobileDescription') },
  ] as const;

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2 dark:bg-[#0a0a0d]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-[#0a0a0d] p-12 text-neutral-100 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 55% at 20% 0%, color-mix(in oklab, var(--color-primary) 24%, transparent), transparent 70%)',
          }}
        />
        <a href={marketingHref} className="relative w-fit">
          <Logo size={30} textClassName="text-white" />
        </a>

        <div className="relative">
          <h2 className="max-w-md text-4xl leading-[1.1] font-bold tracking-tight text-neutral-50">
            {t('tagline')}
          </h2>
          <p className="mt-4 max-w-sm leading-relaxed text-neutral-400">{t('description')}</p>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-primary ring-1 ring-white/10">
                  <p.icon aria-hidden className="size-4" />
                </span>
                <span>
                  <span className="font-medium text-neutral-100">{p.label}</span>{' '}
                  <span className="text-neutral-500">· {p.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-neutral-600">© {new Date().getFullYear()} Mr Wallet</p>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <a href={marketingHref} className="lg:invisible">
            <Logo size={28} textClassName="text-neutral-900 dark:text-white" />
          </a>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
