'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  Tags,
  Landmark,
  Target,
  Repeat,
  BarChart3,
  TrendingUp,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/accounts', icon: Wallet, key: 'accounts' },
  { href: '/transactions', icon: ArrowLeftRight, key: 'transactions' },
  { href: '/budgets', icon: PiggyBank, key: 'budgets' },
  { href: '/categories', icon: Tags, key: 'categories' },
  { href: '/debts', icon: Landmark, key: 'debts' },
  { href: '/goals', icon: Target, key: 'goals' },
  { href: '/recurrences', icon: Repeat, key: 'recurrences' },
  { href: '/reports', icon: BarChart3, key: 'reports' },
  { href: '/forecast', icon: TrendingUp, key: 'forecast' },
  { href: '/preferences', icon: Settings, key: 'preferences' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function onLogout() {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      // best-effort: proceed to clear local state regardless
    }
    setAccessToken(null);
    router.push('/login');
  }

  const navList = (
    <nav aria-label={t('mainNavigation')} className="flex-1 space-y-1 px-3">
      {NAV_ITEMS.map(({ href, icon: Icon, key }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-white'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
            )}
          >
            <Icon size={20} aria-hidden="true" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-bg-secondary md:flex">
      {/* Desktop sidebar */}
      <aside
        aria-label={t('sidebar')}
        className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-border md:bg-white"
      >
        <div className="flex h-16 items-center gap-2 px-6">
          <span className="text-lg font-bold text-primary-dark">Mr Wallet</span>
        </div>
        {navList}
        <div className="p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <LogOut size={20} aria-hidden="true" />
            {t('logout')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-16 items-center justify-between border-b border-border bg-white px-4 md:hidden">
        <span className="text-lg font-bold text-primary-dark">Mr Wallet</span>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? t('closeMenu') : t('openMenu')}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-neutral-100"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      {mobileOpen && (
        <div className="flex flex-col border-b border-border bg-white pb-3 md:hidden">
          {navList}
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              <LogOut size={20} aria-hidden="true" />
              {t('logout')}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1">
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
