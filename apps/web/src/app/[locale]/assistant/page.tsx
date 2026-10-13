'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AssistantOptIn } from '@/components/assistant/AssistantOptIn';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageLoader } from '@/components/shared/PageLoader';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { apiClient, ApiError } from '@/lib/api-client';
import { useRouter } from '@/i18n/navigation';

export default function AssistantPage() {
  const t = useTranslations('assistant');
  const tError = useTranslations('error');
  const router = useRouter();
  const { status, loaded, refresh } = useAssistantStatus();
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  /**
   * RG-AP8: the consent is recorded by the server, which refuses questions without it. The status is read
   * again afterwards rather than assumed, so what the page shows is what the server holds.
   */
  async function change(request: () => Promise<unknown>) {
    setBusy(true);
    setErrorCode(null);
    try {
      await request();
      await refresh();
    } catch (err) {
      setErrorCode(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <PageLoader />;

  const accept = () => change(() => apiClient.put('/assistant/opt-in'));
  const revoke = () => change(() => apiClient.delete('/assistant/opt-in'));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t('subtitle')}</p>
        </div>
        {status?.enabled && status.optedIn && (
          <Button variant="outline" size="sm" disabled={busy} onClick={revoke}>
            {t('optIn.revoke')}
          </Button>
        )}
      </header>

      {errorCode && (
        <p role="alert" className="text-sm text-destructive">
          {tError(errorCode as never)}
        </p>
      )}

      {!status?.enabled ? (
        <EmptyState title={t('unavailableTitle')} description={t('unavailableBody')} />
      ) : !status.optedIn ? (
        <AssistantOptIn busy={busy} onAccept={accept} onDecline={() => router.push('/accounts')} />
      ) : (
        <AssistantPanel remainingToday={status.remainingToday} onAsked={() => void refresh()} />
      )}
    </div>
  );
}
