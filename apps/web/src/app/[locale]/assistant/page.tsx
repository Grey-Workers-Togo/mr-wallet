'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AssistantOptIn } from '@/components/assistant/AssistantOptIn';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageLoader } from '@/components/shared/PageLoader';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { useMe } from '@/hooks/useMe';
import { readOptIn, writeOptIn } from '@/lib/assistant/optin';

export default function AssistantPage() {
  const t = useTranslations('assistant');
  const me = useMe();
  const { status, loaded, refresh } = useAssistantStatus();
  const [optedIn, setOptedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (me) setOptedIn(readOptIn(me.id));
  }, [me]);

  function accept() {
    if (!me) return;
    writeOptIn(me.id, true);
    setOptedIn(true);
  }

  function revoke() {
    if (!me) return;
    writeOptIn(me.id, false);
    setOptedIn(false);
  }

  if (!loaded || !me || optedIn === null) return <PageLoader />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t('subtitle')}</p>
        </div>
        {status?.enabled && optedIn && (
          <Button variant="outline" size="sm" onClick={revoke}>
            {t('optIn.revoke')}
          </Button>
        )}
      </header>

      {!status?.enabled ? (
        <EmptyState title={t('unavailableTitle')} description={t('unavailableBody')} />
      ) : !optedIn ? (
        <AssistantOptIn onAccept={accept} onDecline={revoke} />
      ) : (
        <AssistantPanel remainingToday={status.remainingToday} onAsked={() => void refresh()} />
      )}
    </div>
  );
}
