'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export function ServiceWorkerRegistration() {
  const t = useTranslations('pwa');
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div role="status" aria-live="polite" style={{ background: '#78350f', color: '#fff7ed', padding: '0.5rem 1rem' }}>
      {t('offlineBanner')}
    </div>
  );
}
