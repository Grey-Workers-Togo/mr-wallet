'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

async function downloadPost(path: string, body: unknown, fallbackFilename: string) {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error('EXPORT_FAILED');
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const t = useTranslations('export');
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<void>) {
    setLoading(key);
    try {
      await action();
      toast({ title: tCommon('createSuccessTitle'), variant: 'success' });
    } catch {
      toast({ title: tCommon('actionErrorTitle'), variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          loading={loading === 'csv'}
          onClick={() => run('csv', () => downloadPost('/export/transactions', { format: 'CSV' }, 'transactions.csv'))}
        >
          {t('transactionsCsv')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={loading === 'xlsx'}
          onClick={() => run('xlsx', () => downloadPost('/export/transactions', { format: 'XLSX' }, 'transactions.xlsx'))}
        >
          {t('transactionsXlsx')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={loading === 'full'}
          onClick={() => run('full', () => downloadPost('/export/full', {}, 'export.zip'))}
        >
          {t('full')}
        </Button>
      </div>
    </div>
  );
}
