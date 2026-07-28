'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

interface Goal {
  id: string;
  name: string;
  targetMinor: string;
  currentMinor: string;
  currency: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

export default function GoalsPage() {
  const t = useTranslations('goals');
  const tStatus = useTranslations('goals.status');
  const tError = useTranslations('error');

  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [name, setName] = useState('');
  const [targetMinor, setTargetMinor] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setGoals(await apiClient.get<Goal[]>('/goals'));
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/goals', {
        name,
        targetMinor,
        currency: 'XOF',
        targetDate: targetDate || undefined,
      });
      setName('');
      setTargetMinor('');
      setTargetDate('');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/goals/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>

      {goals === null && <p>...</p>}
      {goals?.length === 0 && <p>{t('empty')}</p>}
      {goals && goals.length > 0 && (
        <ul>
          {goals.map((goal) => (
            <li key={goal.id}>
              {goal.name} — {tStatus(goal.status)} — {goal.currentMinor} / {goal.targetMinor} {goal.currency}
              <button type="button" onClick={() => onDelete(goal.id)}>
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
          {t('targetLabel')}
          <input value={targetMinor} onChange={(e) => setTargetMinor(e.target.value)} required />
        </label>
        <label>
          {t('targetDateLabel')}
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>
    </main>
  );
}
