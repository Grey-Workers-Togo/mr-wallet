'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useCurrencies } from '@/hooks/useCurrencies';

const ACCOUNT_TYPES = ['CASH', 'BANK', 'MOBILE_MONEY', 'CREDIT_CARD', 'SAVINGS', 'WALLET', 'OTHER'] as const;

interface Account {
  id: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  currency: string;
  openingBalanceMinor: string;
  currentBalanceMinor: string;
}

export default function AccountsPage() {
  const t = useTranslations('accounts');
  const tType = useTranslations('account.type');
  const tError = useTranslations('error');

  const currencies = useCurrencies();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>('BANK');
  const [currency, setCurrency] = useState('XOF');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceAt, setOpeningBalanceAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  async function loadAccounts() {
    const list = await apiClient.get<Account[]>('/accounts');
    setAccounts(list);
  }

  useEffect(() => {
    loadAccounts().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/accounts', {
        name,
        type,
        currency,
        openingBalanceMinor: openingBalance,
        openingBalanceAt,
        includeInNetWorth: true,
      });
      setName('');
      await loadAccounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && <Alert variant="error">{tError(error as never)}</Alert>}

      {accounts === null && <p className="text-neutral-600">...</p>}
      {accounts?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {accounts && accounts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium text-neutral-900">{account.name}</h3>
                <Badge variant="primary">{tType(account.type)}</Badge>
              </div>
              <p className="mt-3 text-2xl font-semibold text-neutral-900">
                {account.currentBalanceMinor} <span className="text-base font-normal text-neutral-600">{account.currency}</span>
              </p>
            </Card>
          ))}
        </div>
      )}

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
              <Label htmlFor="type">{t('typeLabel')}</Label>
              <Select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as (typeof ACCOUNT_TYPES)[number])}
              >
                {ACCOUNT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {tType(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">{t('currencyLabel')}</Label>
              <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} required>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="openingBalance">{t('openingBalanceLabel')}</Label>
              <AmountInput
                id="openingBalance"
                value={openingBalance}
                onValueChange={setOpeningBalance}
                required
              />
            </div>
            <div>
              <Label htmlFor="openingBalanceAt">{t('openingBalanceAtLabel')}</Label>
              <Input
                id="openingBalanceAt"
                type="date"
                value={openingBalanceAt}
                onChange={(e) => setOpeningBalanceAt(e.target.value)}
                required
              />
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
