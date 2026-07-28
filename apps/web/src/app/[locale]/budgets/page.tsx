'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

const PERIODS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'] as const;

interface Category {
  id: string;
  name: string | null;
  i18nKey: string | null;
}

interface Budget {
  id: string;
  name: string;
  categoryId: string | null;
  amountMinor: string;
  period: (typeof PERIODS)[number];
}

interface CurrentBudget {
  budget: Budget;
  period: { allocatedMinor: string; spentMinor: string };
}

export default function BudgetsPage() {
  const t = useTranslations('budgets');
  const tPeriod = useTranslations('budgets.period');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');

  const [categories, setCategories] = useState<Category[]>([]);
  const [current, setCurrent] = useState<CurrentBudget[] | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('MONTHLY');
  const [startsOn, setStartsOn] = useState('');
  const [rollover, setRollover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolveCategoryName(category: Category): string {
    if (category.name) return category.name;
    if (category.i18nKey) return tCategoryType(category.i18nKey as never);
    return '';
  }

  async function loadAll() {
    const [categoryList, currentList] = await Promise.all([
      apiClient.get<Category[]>('/categories'),
      apiClient.get<CurrentBudget[]>('/budgets/current'),
    ]);
    setCategories(categoryList);
    setCurrent(currentList);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/budgets', {
        name,
        categoryId: categoryId || undefined,
        amountMinor,
        currency: 'XOF',
        period,
        startsOn,
        rollover,
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
      await apiClient.delete(`/budgets/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>

      {current === null && <p>...</p>}
      {current?.length === 0 && <p>{t('empty')}</p>}
      {current && current.length > 0 && (
        <ul>
          {current.map(({ budget, period: budgetPeriod }) => (
            <li key={budget.id}>
              {budget.name} — {tPeriod(budget.period)} — {t('spent')}: {budgetPeriod.spentMinor} / {budgetPeriod.allocatedMinor}
              <button type="button" onClick={() => onDelete(budget.id)}>
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
          {t('categoryLabel')}
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('globalCategory')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {resolveCategoryName(category)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('amountLabel')}
          <input value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} required />
        </label>
        <label>
          {t('periodLabel')}
          <select value={period} onChange={(e) => setPeriod(e.target.value as (typeof PERIODS)[number])}>
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {tPeriod(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('startsOnLabel')}
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </label>
        <label>
          {t('rolloverLabel')}
          <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>
    </main>
  );
}
