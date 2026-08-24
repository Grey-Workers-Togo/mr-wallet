'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AmountInput } from '@/components/ui/amount-input';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/shared/PageLoader';
import { LineChart } from '@/components/charts/LineChart';
import { useCurrencies } from '@/hooks/useCurrencies';

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

interface RecurrenceRule {
  id: string;
  name: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountMinor: string;
  currency: string;
}

interface OneOff {
  month: string;
  type: 'INCOME' | 'EXPENSE';
  amountMinor: string;
}

const MONTHS = 6;

function toDisplayNumber(amountMinor: string, minorUnits: number) {
  return Number(amountMinor) / 10 ** minorUnits;
}

function defaultOneOffMonth() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

export default function ForecastPage() {
  const t = useTranslations('forecast');
  const tError = useTranslations('error');
  const currencies = useCurrencies();
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recurrences, setRecurrences] = useState<RecurrenceRule[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [oneOffs, setOneOffs] = useState<OneOff[]>([]);
  const [scenario, setScenario] = useState<Forecast | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    apiClient
      .get<Forecast>(`/forecast/cashflow?months=${MONTHS}`)
      .then(setForecast)
      .catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
    apiClient
      .get<RecurrenceRule[]>('/recurrences')
      .then((list) => setRecurrences(list.filter((r) => r.type !== 'TRANSFER')))
      .catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function addOneOff() {
    setOneOffs((list) => [...list, { month: defaultOneOffMonth(), type: 'EXPENSE', amountMinor: '' }]);
  }

  function updateOneOff(index: number, patch: Partial<OneOff>) {
    setOneOffs((list) => list.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function removeOneOff(index: number) {
    setOneOffs((list) => list.filter((_, i) => i !== index));
  }

  function resetScenario() {
    setOverrides({});
    setOneOffs([]);
    setScenario(null);
  }

  async function runScenario() {
    setError(null);
    setIsRunning(true);
    try {
      const payload = {
        months: MONTHS,
        overrides: Object.entries(overrides)
          .filter(([, amountMinor]) => amountMinor.trim() !== '')
          .map(([ruleId, amountMinor]) => ({ ruleId, amountMinor })),
        oneOffs: oneOffs
          .filter((o) => o.amountMinor.trim() !== '')
          .map((o) => ({ month: o.month, type: o.type, amountMinor: o.amountMinor })),
      };
      const result = await apiClient.post<Forecast>('/forecast/scenario', payload);
      setScenario(result);
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
    } finally {
      setIsRunning(false);
    }
  }

  const minorUnits = forecast ? (minorUnitsByCode[forecast.currency] ?? 0) : 0;
  const baselineValues = forecast?.months.map((m) => toDisplayNumber(m.balanceMinor, minorUnits)) ?? [];
  const scenarioValues = scenario?.months.map((m) => toDisplayNumber(m.balanceMinor, minorUnits));
  const monthLabels = forecast?.months.map((m) => m.month) ?? [];

  const oneOffTypeItems = { EXPENSE: t('scenarioOneOffExpense'), INCOME: t('scenarioOneOffIncome') };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{t('disclaimer')}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {forecast === null && !error && <PageLoader />}

      {forecast && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{t('cashflow')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-4">
            {forecast.historyIncomplete && (
              <Alert>
                <AlertDescription>{t('historyIncomplete')}</AlertDescription>
              </Alert>
            )}
            <LineChart
              months={monthLabels}
              seriesA={baselineValues}
              seriesB={scenarioValues}
              colorA="#38bdf8"
              colorB="#f97316"
              labelA={t('baselineLabel')}
              labelB={t('scenarioLabel')}
              unit={forecast.currency}
            />
            <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: '#38bdf8' }} />
                {t('baselineLabel')}
              </span>
              {scenario && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: '#f97316' }} />
                  {t('scenarioLabel')}
                </span>
              )}
            </div>
            {forecast.months.some((m) => m.cashWarning) && (
              <Alert variant="destructive">
                <AlertDescription>{t('cashWarning')}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {forecast && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{t('scenarioTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 space-y-6">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('scenarioDescription')}</p>

            {recurrences.length > 0 && (
              <div>
                <Label>{t('scenarioOverridesLabel')}</Label>
                <div className="mt-2 space-y-2">
                  {recurrences.map((rule) => {
                    const ruleMinorUnits = minorUnitsByCode[rule.currency] ?? 0;
                    return (
                      <div key={rule.id} className="flex items-center gap-3 rounded-md border p-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{rule.name}</span>
                            <Badge variant="secondary">{rule.type}</Badge>
                          </div>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {t('scenarioCurrentAmount', { amount: toDisplayNumber(rule.amountMinor, ruleMinorUnits), currency: rule.currency })}
                          </p>
                        </div>
                        <AmountInput
                          value={overrides[rule.id] ?? ''}
                          onValueChange={(value) => setOverrides((prev) => ({ ...prev, [rule.id]: value }))}
                          placeholder={rule.amountMinor}
                          className="w-32"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <Label>{t('scenarioOneOffsLabel')}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOneOff}>
                  <Plus className="size-4" />
                  {t('scenarioAddOneOff')}
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {oneOffs.map((oneOff, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="month"
                      value={oneOff.month}
                      onChange={(e) => updateOneOff(index, { month: e.target.value })}
                      className="w-36"
                    />
                    <Select
                      items={oneOffTypeItems}
                      value={oneOff.type}
                      onValueChange={(value) => updateOneOff(index, { type: (value ?? 'EXPENSE') as OneOff['type'] })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EXPENSE">{t('scenarioOneOffExpense')}</SelectItem>
                        <SelectItem value="INCOME">{t('scenarioOneOffIncome')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <AmountInput
                      value={oneOff.amountMinor}
                      onValueChange={(value) => updateOneOff(index, { amountMinor: value })}
                      placeholder="0"
                      className="w-32"
                    />
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t('scenarioRemoveOneOff')} onClick={() => removeOneOff(index)}>
                      <Trash2 className="size-3.5 text-red-600" />
                    </Button>
                  </div>
                ))}
                {oneOffs.length === 0 && <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('scenarioNoOneOffs')}</p>}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" loading={isRunning} onClick={runScenario}>
                {t('scenarioRun')}
              </Button>
              {scenario && (
                <Button type="button" variant="outline" onClick={resetScenario}>
                  {t('scenarioReset')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
