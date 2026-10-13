'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface AssistantOptInProps {
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/** RG-AP8: states, before any question, that questions go to an external model provider. */
export function AssistantOptIn({ busy, onAccept, onDecline }: AssistantOptInProps) {
  const t = useTranslations('assistant.optIn');

  return (
    <Card className="mx-auto max-w-2xl p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{t('title')}</h2>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{t('intro')}</p>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{t('providerNotice')}</p>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{t('storageNotice')}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button disabled={busy} onClick={onAccept}>
              {t('accept')}
            </Button>
            <Button variant="outline" disabled={busy} onClick={onDecline}>
              {t('decline')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
