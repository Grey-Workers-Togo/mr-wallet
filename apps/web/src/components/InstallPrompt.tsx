'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Share, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallPrompt() {
  const t = useTranslations('pwa');
  const [mode, setMode] = useState<'none' | 'ios' | 'prompt'>('none');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === '1') return;

    if (isIos()) {
      setMode('ios');
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMode('prompt');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setMode('none');
  }

  async function onInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setMode('none');
  }

  if (mode === 'none') return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-16 z-50 mx-3 flex items-start gap-3 rounded-xl border border-border bg-white p-4 shadow-lg md:bottom-4 md:left-auto md:right-4 md:mx-0 md:w-80"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-neutral-900">{mode === 'ios' ? t('installIosTitle') : t('installBannerTitle')}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {mode === 'ios' ? (
            t.rich('installIosBody', { shareIcon: () => <Share className="inline size-4 align-text-bottom" aria-hidden="true" /> })
          ) : (
            t('installBannerBody')
          )}
        </p>
        {mode === 'prompt' && (
          <Button type="button" size="sm" className="mt-3" onClick={onInstall}>
            <Download className="size-4" aria-hidden="true" />
            {t('installAction')}
          </Button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label={t('dismiss')} className="text-neutral-400 hover:text-neutral-600">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
