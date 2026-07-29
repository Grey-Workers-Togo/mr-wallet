'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}
      {dashboard === null && !error && <p className="text-neutral-600">...</p>}
      {dashboard && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle>{t('netWorth')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-2xl font-semibold text-neutral-900">
                {dashboard.netWorth.netWorthMinor} <span className="text-base font-normal text-neutral-600">{dashboard.netWorth.currency}</span>
              </p>
            </CardContent>
          </Card>

          {dashboard.currentMonth && (
            <Card className="p-6">
              <CardHeader className="p-0 pb-4">
                <CardTitle>{t('monthlySummary')}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <p className="text-neutral-900">
                  {dashboard.currentMonth.month}: +{dashboard.currentMonth.incomeMinor} / -{dashboard.currentMonth.expenseMinor}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="p-6 md:col-span-2">
            <CardHeader className="p-0 pb-4">
              <CardTitle>{t('budgetVsActual')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-2">
              {dashboard.budgets.map((b) => (
                <div key={b.budgetId} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="text-neutral-900">{b.budgetName}</span>
                  <span className="text-neutral-900">
                    {b.spentMinor} / {b.allocatedMinor}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
