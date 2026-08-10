'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  Tags,
  Tag,
  Landmark,
  Target,
  Repeat,
  BarChart3,
  TrendingUp,
  Settings,
  Upload,
  Download,
  Bell,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { apiClient } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/shared/Logo';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PRIMARY_NAV_ITEMS = [
  { href: '/accounts', icon: Wallet, key: 'accounts' },
  { href: '/transactions', icon: ArrowLeftRight, key: 'transactions' },
  { href: '/reports', icon: BarChart3, key: 'reports' },
  { href: '/preferences', icon: Settings, key: 'preferences' },
] as const;

const SECONDARY_NAV_ITEMS = [
  { href: '/budgets', icon: PiggyBank, key: 'budgets' },
  { href: '/categories', icon: Tags, key: 'categories' },
  { href: '/tags', icon: Tag, key: 'tags' },
  { href: '/debts', icon: Landmark, key: 'debts' },
  { href: '/goals', icon: Target, key: 'goals' },
  { href: '/recurrences', icon: Repeat, key: 'recurrences' },
  { href: '/import', icon: Upload, key: 'import' },
  { href: '/export', icon: Download, key: 'export' },
  { href: '/forecast', icon: TrendingUp, key: 'forecast' },
  { href: '/notifications', icon: Bell, key: 'notifications' },
] as const;

const NAV_ITEMS = [...PRIMARY_NAV_ITEMS, ...SECONDARY_NAV_ITEMS] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  async function onLogout() {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      // best-effort: proceed to clear local state regardless
    }
    setAccessToken(null);
    router.push('/login');
  }

  function renderNavItems(items: readonly (typeof NAV_ITEMS)[number][]) {
    return items.map(({ href, icon: Icon, key }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return (
        <Link
          key={href}
          href={href}
          onClick={() => setMobileOpen(false)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            active ? 'bg-primary text-white' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
          )}
        >
          <Icon size={20} aria-hidden="true" />
          {t(key)}
        </Link>
      );
    });
  }

  const navList = (
    <nav aria-label={t('mainNavigation')} className="flex-1 space-y-1 px-3">
      {renderNavItems(NAV_ITEMS)}
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
          <Logo />
        </div>
        {navList}
        <div className="p-3">
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <LogOut size={20} aria-hidden="true" />
            {t('logout')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-16 items-center border-b border-border bg-white px-4 md:hidden">
        <Logo />
      </header>

      {mobileOpen && (
        <div className="fixed inset-x-0 bottom-16 z-40 flex max-h-[70vh] flex-col overflow-y-auto border-t border-border bg-white pb-3 shadow-lg md:hidden">
          <nav aria-label={t('mainNavigation')} className="flex-1 space-y-1 px-3 pt-3">
            {renderNavItems(SECONDARY_NAV_ITEMS)}
          </nav>
          <div className="px-3 pt-2">
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              <LogOut size={20} aria-hidden="true" />
              {t('logout')}
            </button>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav
        aria-label={t('mainNavigation')}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-white md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {PRIMARY_NAV_ITEMS.map(({ href, icon: Icon, key }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium',
                active ? 'text-primary' : 'text-neutral-500',
              )}
            >
              <Icon size={22} aria-hidden="true" />
              {t(key)}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? t('closeMenu') : t('openMenu')}
          className={cn('flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium', mobileOpen ? 'text-primary' : 'text-neutral-500')}
        >
          {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          {t('more')}
        </button>
      </nav>

      <div className="flex-1">
        <main className="mx-auto max-w-5xl px-4 py-6 pb-20 md:px-8 md:py-8 md:pb-8">
          {children}
        </main>
      </div>

      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('logoutConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('logoutConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('logoutConfirmCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onLogout}>{t('logoutConfirmAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
