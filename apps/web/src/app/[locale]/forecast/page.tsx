'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageLoader } from '@/components/shared/PageLoader';

interface ForecastMonth {
  month: string;
  balanceMinor: string;
  cashWarning: boolean;
}

interface Forecast {
  currency: string;
  historyIncomplete: boolean;
  months: ForecastMonth[];
}

export default function ForecastPage() {
  const t = useTranslations('forecast');
  const tError = useTranslations('error');

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<Forecast>('/forecast/cashflow?months=6')
      .then(setForecast)
      .catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">{t('disclaimer')}</p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}
      {forecast === null && !error && <PageLoader />}
      {forecast && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{t('title')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-3">
            {forecast.historyIncomplete && (
              <Alert>
                <AlertDescription>{t('historyIncomplete')}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              {forecast.months.map((m) => (
                <div key={m.month} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="text-neutral-900 dark:text-neutral-100">{m.month}</span>
                  <span className="text-neutral-900 dark:text-neutral-100">
                    {m.balanceMinor} {forecast.currency}
                    {m.cashWarning && <strong className="ml-2 text-warning">— {t('cashWarning')}</strong>}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
