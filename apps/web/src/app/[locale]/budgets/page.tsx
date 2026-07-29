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
    if (category.i18nKey) return tCategoryType(category.i18nKey.replaceAll('.', '_') as never);
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
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {current === null && <p className="text-neutral-600">...</p>}
      {current?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {current && current.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {current.map(({ budget, period: budgetPeriod }) => (
            <Card key={budget.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium text-neutral-900">{budget.name}</h3>
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(budget.id)}>
                  {t('delete')}
                </Button>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{tPeriod(budget.period)}</p>
              <p className="mt-3 text-neutral-900">
                {t('spent')}: {budgetPeriod.spentMinor} / {budgetPeriod.allocatedMinor}
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
              <Label htmlFor="categoryId">{t('categoryLabel')}</Label>
              <Select
                value={categoryId || undefined}
                onValueChange={(value) => setCategoryId(value === '__none__' || value === null ? '' : value)}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder={t('globalCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('globalCategory')}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {resolveCategoryName(category)}
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
              <Label htmlFor="period">{t('periodLabel')}</Label>
              <Select value={period} onValueChange={(value) => setPeriod(value as (typeof PERIODS)[number])}>
                <SelectTrigger id="period" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tPeriod(value)}
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
              <Checkbox id="rollover" checked={rollover} onCheckedChange={setRollover} />
              <Label htmlFor="rollover" className="mb-0">{t('rolloverLabel')}</Label>
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
