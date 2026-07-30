'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/useToast';

interface Account {
  id: string;
  name: string;
}

interface PreviewRow {
  rowIndex: number;
  candidate: { description: string; amountMinor: string; type: string; occurredAt: string };
}

interface UploadResult {
  batch: { id: string };
  toImport: PreviewRow[];
  duplicates: unknown[];
  errors: { rowIndex: number; column: string; message: string }[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export default function ImportPage() {
  const t = useTranslations('import');
  const tError = useTranslations('error');
  const tCommon = useTranslations('common');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [dateFormat, setDateFormat] = useState<'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'>('dd/MM/yyyy');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const accountItems = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const dateFormatItems: Record<string, string> = {
    'dd/MM/yyyy': 'dd/MM/yyyy',
    'MM/dd/yyyy': 'MM/dd/yyyy',
    'yyyy-MM-dd': 'yyyy-MM-dd',
  };

  useEffect(() => {
    apiClient
      .get<Account[]>('/accounts')
      .then((list) => {
        setAccounts(list);
        if (list[0]) setAccountId(list[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) return;
    setUploading(true);

    const payload = {
      accountId,
      dateFormat,
      decimalSeparator: ',',
      thousandSeparator: ' ',
      amountStrategy: 'SIGNED_SINGLE_COLUMN',
      mapping: { occurredAt: 'Date', description: 'Libelle', amount: 'Montant' },
      force: false,
    };

    const form = new FormData();
    form.append('file', file);
    form.append('payload', JSON.stringify(payload));

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE}/import/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const body = await response.json();
      if (!response.ok) {
        const code = body.code ?? 'INTERNAL_ERROR';
        setError(code);
        toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
        return;
      }
      setResult(body);
      toast({ title: tCommon('createSuccessTitle'), variant: 'success' });
    } finally {
      setUploading(false);
    }
  }

  async function onCommit() {
    if (!result) return;
    setCommitting(true);
    setError(null);
    try {
      await apiClient.post(`/import/batches/${result.batch.id}/commit`, { excludeRowIndexes: [] });
      setResult(null);
      setFile(null);
      toast({ title: tCommon('createSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <CardContent className="p-0">
          <form onSubmit={onUpload} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="accountId" required>{t('accountLabel')}</Label>
              <Select items={accountItems} value={accountId} onValueChange={(value) => setAccountId(value ?? '')}>
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dateFormat" required>{t('dateFormatLabel')}</Label>
              <Select
                items={dateFormatItems}
                value={dateFormat}
                onValueChange={(value) => setDateFormat(value as typeof dateFormat)}
              >
                <SelectTrigger id="dateFormat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                  <SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem>
                  <SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="file" required>{t('fileLabel')}</Label>
              <Input
                id="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" loading={uploading}>
                {t('submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle>
              {t('toImport')}: {result.toImport.length} — {t('duplicates')}: {result.duplicates.length} — {t('errors')}:{' '}
              {result.errors.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {result.toImport.map((row) => (
                    <tr key={row.rowIndex} className="border-b border-border">
                      <td className="py-2 pr-4 text-neutral-600">{row.candidate.occurredAt.slice(0, 10)}</td>
                      <td className="py-2 pr-4 text-neutral-900">{row.candidate.description}</td>
                      <td className="py-2 pr-4 text-neutral-600">{row.candidate.type}</td>
                      <td className="py-2 text-neutral-900">{row.candidate.amountMinor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <Button type="button" onClick={onCommit} loading={committing}>
                {t('commit')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setResult(null)}>
                {t('cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
