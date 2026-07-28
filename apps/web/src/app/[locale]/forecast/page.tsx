'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

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
    <main>
      <h1>{t('title')}</h1>
      <p>{t('disclaimer')}</p>
      {error && <p role="alert">{tError(error as never)}</p>}
      {forecast === null && !error && <p>...</p>}
      {forecast && (
        <>
          {forecast.historyIncomplete && <p>{t('historyIncomplete')}</p>}
          <ul>
            {forecast.months.map((m) => (
              <li key={m.month}>
                {m.month}: {m.balanceMinor} {forecast.currency}
                {m.cashWarning && <strong> — {t('cashWarning')}</strong>}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
