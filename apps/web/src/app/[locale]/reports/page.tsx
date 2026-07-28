'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

interface Dashboard {
  netWorth: { currency: string; netWorthMinor: string; assetsMinor: string; liabilitiesMinor: string };
  budgets: { budgetId: string; budgetName: string; allocatedMinor: string; spentMinor: string }[];
  currentMonth: { month: string; incomeMinor: string; expenseMinor: string; netMinor: string } | null;
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const tError = useTranslations('error');

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Dashboard>('/reports/dashboard')
      .then(setDashboard)
      .catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  return (
    <main>
      <h1>{t('title')}</h1>
      {error && <p role="alert">{tError(error as never)}</p>}
      {dashboard === null && !error && <p>...</p>}
      {dashboard && (
        <>
          <section>
            <h2>{t('netWorth')}</h2>
            <p>
              {dashboard.netWorth.netWorthMinor} {dashboard.netWorth.currency}
            </p>
          </section>

          {dashboard.currentMonth && (
            <section>
              <h2>{t('monthlySummary')}</h2>
              <p>
                {dashboard.currentMonth.month}: +{dashboard.currentMonth.incomeMinor} / -{dashboard.currentMonth.expenseMinor}
              </p>
            </section>
          )}

          <section>
            <h2>{t('budgetVsActual')}</h2>
            <ul>
              {dashboard.budgets.map((b) => (
                <li key={b.budgetId}>
                  {b.budgetName}: {b.spentMinor} / {b.allocatedMinor}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
