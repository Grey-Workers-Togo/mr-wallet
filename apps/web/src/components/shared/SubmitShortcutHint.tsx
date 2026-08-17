'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/** Shows a Ctrl+Enter submit hint under a form's submit button, desktop/tablet only (hidden on touch phones). */
export function SubmitShortcutHint() {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);
  const [shortcut, setShortcut] = useState('Ctrl+Enter');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    setVisible(mediaQuery.matches);
    const onChange = (e: MediaQueryListEvent) => setVisible(e.matches);
    mediaQuery.addEventListener('change', onChange);

    if (/Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
      setShortcut('⌘+Enter');
    }

    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  if (!visible) return null;

  return (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      {t('submitShortcutHint', { shortcut })}
    </p>
  );
}
