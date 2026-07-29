'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

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

  const accountItems = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const frequencyItems = Object.fromEntries(FREQUENCIES.map((value) => [value, tFrequency(value)]));

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
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {rules === null && <p className="text-neutral-600">...</p>}
      {rules?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {rules && rules.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => (
            <Card key={rule.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium text-neutral-900">{rule.name}</h3>
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(rule.id)}>
                  {t('delete')}
                </Button>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{tFrequency(rule.frequency)}</p>
              <p className="mt-3 text-neutral-900">{rule.amountMinor}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t('upcoming')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          {upcoming.map((item) => (
            <div key={`${item.recurrenceId}-${item.occurrenceDate}`} className="flex items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
              <p className="text-neutral-900">
                {item.name} — {item.occurrenceDate.slice(0, 10)}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => onMaterialize(item.recurrenceId, item.occurrenceDate)}>
                {t('materialize')}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t('create')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="accountId">{t('accountLabel')}</Label>
              <Select items={accountItems} value={accountId} onValueChange={(value) => setAccountId(value ?? '')}>
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="amountMinor">{t('amountLabel')}</Label>
              <AmountInput id="amountMinor" value={amountMinor} onValueChange={setAmountMinor} required />
            </div>
            <div>
              <Label htmlFor="frequency">{t('frequencyLabel')}</Label>
              <Select
                items={frequencyItems}
                value={frequency}
                onValueChange={(value) => setFrequency(value as (typeof FREQUENCIES)[number])}
              >
                <SelectTrigger id="frequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tFrequency(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="startsOn">{t('startsOnLabel')}</Label>
              <Input id="startsOn" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="autoCreate" checked={autoCreate} onCheckedChange={setAutoCreate} />
              <Label htmlFor="autoCreate" className="mb-0">{t('autoCreateLabel')}</Label>
            </div>
            <div className="md:col-span-2">
              <Button type="submit">{t('submit')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
