'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

const ACCOUNT_TYPES = ['CASH', 'BANK', 'MOBILE_MONEY', 'CREDIT_CARD', 'SAVINGS', 'WALLET', 'OTHER'] as const;

interface Account {
  id: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  currency: string;
  openingBalanceMinor: string;
  currentBalanceMinor: string;
}

export default function AccountsPage() {
  const t = useTranslations('accounts');
  const tType = useTranslations('account.type');
  const tError = useTranslations('error');

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>('BANK');
  const [currency, setCurrency] = useState('EUR');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceAt, setOpeningBalanceAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  async function loadAccounts() {
    const list = await apiClient.get<Account[]>('/accounts');
    setAccounts(list);
  }

  useEffect(() => {
    loadAccounts().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/accounts', {
        name,
        type,
        currency,
        openingBalanceMinor: openingBalance,
        openingBalanceAt,
        includeInNetWorth: true,
      });
      setName('');
      await loadAccounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>

      {accounts === null && <p>...</p>}
      {accounts?.length === 0 && <p>{t('empty')}</p>}
      {accounts && accounts.length > 0 && (
        <ul>
          {accounts.map((account) => (
            <li key={account.id}>
              {account.name} — {tType(account.type)} — {account.currentBalanceMinor} {account.currency}
            </li>
          ))}
        </ul>
      )}

      <h2>{t('create')}</h2>
      <form onSubmit={onSubmit}>
        <label>
          {t('nameLabel')}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {t('typeLabel')}
          <select value={type} onChange={(e) => setType(e.target.value as (typeof ACCOUNT_TYPES)[number])}>
            {ACCOUNT_TYPES.map((value) => (
              <option key={value} value={value}>
                {tType(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('currencyLabel')}
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            minLength={3}
            required
          />
        </label>
        <label>
          {t('openingBalanceLabel')}
          <input
            type="number"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            required
          />
        </label>
        <label>
          {t('openingBalanceAtLabel')}
          <input
            type="date"
            value={openingBalanceAt}
            onChange={(e) => setOpeningBalanceAt(e.target.value)}
            required
          />
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>
    </main>
  );
}
