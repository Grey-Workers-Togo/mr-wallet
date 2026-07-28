'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

const FREQUENCIES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY'] as const;

interface Account {
  id: string;
  name: string;
}

interface RecurrenceRule {
  id: string;
  name: string;
  accountId: string;
  amountMinor: string;
  frequency: (typeof FREQUENCIES)[number];
  autoCreate: boolean;
}

interface Upcoming {
  recurrenceId: string;
  name: string;
  occurrenceDate: string;
}

export default function RecurrencesPage() {
  const t = useTranslations('recurrences');
  const tFrequency = useTranslations('recurrences.frequency');
  const tError = useTranslations('error');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<RecurrenceRule[] | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('MONTHLY');
  const [startsOn, setStartsOn] = useState('');
  const [autoCreate, setAutoCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    const [accountList, ruleList, upcomingList] = await Promise.all([
      apiClient.get<Account[]>('/accounts'),
      apiClient.get<RecurrenceRule[]>('/recurrences'),
      apiClient.get<Upcoming[]>('/recurrences/upcoming?days=30'),
    ]);
    setAccounts(accountList);
    if (accountList[0] && !accountId) setAccountId(accountList[0].id);
    setRules(ruleList);
    setUpcoming(upcomingList);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/recurrences', {
        name,
        type: 'EXPENSE',
        accountId,
        amountMinor,
        currency: 'XOF',
        frequency,
        startsOn,
        autoCreate,
      });
      setName('');
      setAmountMinor('');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/recurrences/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onMaterialize(recurrenceId: string, occurrenceDate: string) {
    setError(null);
    try {
      await apiClient.post(`/recurrences/${recurrenceId}/materialize`, { occurrenceDate });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>

      {rules === null && <p>...</p>}
      {rules?.length === 0 && <p>{t('empty')}</p>}
      {rules && rules.length > 0 && (
        <ul>
          {rules.map((rule) => (
            <li key={rule.id}>
              {rule.name} — {tFrequency(rule.frequency)} — {rule.amountMinor}
              <button type="button" onClick={() => onDelete(rule.id)}>
                {t('delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>{t('upcoming')}</h2>
      <ul>
        {upcoming.map((item) => (
          <li key={`${item.recurrenceId}-${item.occurrenceDate}`}>
            {item.name} — {item.occurrenceDate.slice(0, 10)}
            <button type="button" onClick={() => onMaterialize(item.recurrenceId, item.occurrenceDate)}>
              {t('materialize')}
            </button>
          </li>
        ))}
      </ul>

      <h2>{t('create')}</h2>
      <form onSubmit={onSubmit}>
        <label>
          {t('nameLabel')}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
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
          {t('amountLabel')}
          <input value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} required />
        </label>
        <label>
          {t('frequencyLabel')}
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as (typeof FREQUENCIES)[number])}>
            {FREQUENCIES.map((value) => (
              <option key={value} value={value}>
                {tFrequency(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('startsOnLabel')}
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </label>
        <label>
          {t('autoCreateLabel')}
          <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} />
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>
    </main>
  );
}
