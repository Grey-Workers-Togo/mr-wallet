'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth-store';

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

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [dateFormat, setDateFormat] = useState<'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'>('dd/MM/yyyy');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

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

    const token = getAccessToken();
    const response = await fetch(`${API_BASE}/import/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.code ?? 'INTERNAL_ERROR');
      return;
    }
    setResult(body);
  }

  async function onCommit() {
    if (!result) return;
    setCommitting(true);
    setError(null);
    try {
      await apiClient.post(`/import/batches/${result.batch.id}/commit`, { excludeRowIndexes: [] });
      setResult(null);
      setFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>

      <form onSubmit={onUpload}>
        <label>
          {t('accountLabel')}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('dateFormatLabel')}
          <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}>
            <option value="dd/MM/yyyy">dd/MM/yyyy</option>
            <option value="MM/dd/yyyy">MM/dd/yyyy</option>
            <option value="yyyy-MM-dd">yyyy-MM-dd</option>
          </select>
        </label>
        <label>
          {t('fileLabel')}
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>

      {result && (
        <section>
          <h2>
            {t('toImport')}: {result.toImport.length} — {t('duplicates')}: {result.duplicates.length} — {t('errors')}:{' '}
            {result.errors.length}
          </h2>
          <ul>
            {result.toImport.map((row) => (
              <li key={row.rowIndex}>
                {row.candidate.occurredAt.slice(0, 10)} — {row.candidate.description} — {row.candidate.type} —{' '}
                {row.candidate.amountMinor}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onCommit} disabled={committing}>
            {t('commit')}
          </button>
          <button type="button" onClick={() => setResult(null)}>
            {t('cancel')}
          </button>
        </section>
      )}
    </main>
  );
}
