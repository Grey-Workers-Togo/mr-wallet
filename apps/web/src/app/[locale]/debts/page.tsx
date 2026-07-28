'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

const DIRECTIONS = ['OWED_BY_ME', 'OWED_TO_ME'] as const;

interface Debt {
  id: string;
  name: string;
  direction: (typeof DIRECTIONS)[number];
  outstandingPrincipalMinor: string;
  currency: string;
  status: string;
}

export default function DebtsPage() {
  const t = useTranslations('debts');
  const tDirection = useTranslations('debts.direction');
  const tError = useTranslations('error');

  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>('OWED_BY_ME');
  const [principalMinor, setPrincipalMinor] = useState('');
  const [annualRatePct, setAnnualRatePct] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setDebts(await apiClient.get<Debt[]>('/debts'));
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/debts', {
        name,
        direction,
        principalMinor,
        currency: 'XOF',
        rateType: annualRatePct ? 'FIXED' : 'ZERO',
        annualRatePct: annualRatePct ? Number(annualRatePct) : undefined,
        termMonths: termMonths ? Number(termMonths) : undefined,
        startedOn,
        paymentFrequency: 'MONTHLY',
      });
      setName('');
      setPrincipalMinor('');
      setAnnualRatePct('');
      setTermMonths('');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/debts/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>

      {debts === null && <p>...</p>}
      {debts?.length === 0 && <p>{t('empty')}</p>}
      {debts && debts.length > 0 && (
        <ul>
          {debts.map((debt) => (
            <li key={debt.id}>
              {debt.name} — {tDirection(debt.direction)} — {t('outstanding')}: {debt.outstandingPrincipalMinor} {debt.currency}
              <button type="button" onClick={() => onDelete(debt.id)}>
                {t('delete')}
              </button>
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
          {t('directionLabel')}
          <select value={direction} onChange={(e) => setDirection(e.target.value as (typeof DIRECTIONS)[number])}>
            {DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {tDirection(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('principalLabel')}
          <input value={principalMinor} onChange={(e) => setPrincipalMinor(e.target.value)} required />
        </label>
        <label>
          {t('rateLabel')}
          <input value={annualRatePct} onChange={(e) => setAnnualRatePct(e.target.value)} />
        </label>
        <label>
          {t('termLabel')}
          <input value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
        </label>
        <label>
          {t('startedOnLabel')}
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} required />
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>
    </main>
  );
}
