'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  rollover: boolean;
}

interface CurrentBudget {
  budget: Budget;
  period: { allocatedMinor: string; spentMinor: string };
}

const DEFAULT_STARTS_ON = () => new Date().toISOString().slice(0, 10);

export default function BudgetsPage() {
  const t = useTranslations('budgets');
  const tPeriod = useTranslations('budgets.period');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');

  const [categories, setCategories] = useState<Category[]>([]);
  const [current, setCurrent] = useState<CurrentBudget[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('MONTHLY');
  const [startsOn, setStartsOn] = useState(DEFAULT_STARTS_ON);
  const [rollover, setRollover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolveCategoryName(category: Category): string {
    if (category.name) return category.name;
    if (category.i18nKey) return tCategoryType(category.i18nKey.replaceAll('.', '_') as never);
    return '';
  }

  const periodItems = Object.fromEntries(PERIODS.map((value) => [value, tPeriod(value)]));
  const categoryItems = Object.fromEntries([
    ['__none__', t('globalCategory')],
    ...categories.map((c) => [c.id, resolveCategoryName(c)]),
  ]);

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

  function openCreateDialog() {
    setEditingId(null);
    setName('');
    setCategoryId('');
    setAmountMinor('');
    setPeriod('MONTHLY');
    setStartsOn(DEFAULT_STARTS_ON());
    setRollover(false);
    setDialogOpen(true);
  }

  function openEditDialog(budget: Budget) {
    setEditingId(budget.id);
    setName(budget.name);
    setCategoryId(budget.categoryId ?? '');
    setAmountMinor(budget.amountMinor);
    setPeriod(budget.period);
    setStartsOn(DEFAULT_STARTS_ON());
    setRollover(budget.rollover);
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        // categoryId/currency/period/startsOn are immutable after creation
        await apiClient.patch(`/budgets/${editingId}`, { name, amountMinor, rollover });
      } else {
        await apiClient.post('/budgets', {
          name,
          categoryId: categoryId || undefined,
          amountMinor,
          currency: 'XOF',
          period,
          startsOn,
          rollover,
        });
      }
      setDialogOpen(false);
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
        <Button type="button" onClick={openCreateDialog}>
          <Plus className="size-4" />
          {t('add')}
        </Button>
      </div>

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
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => openEditDialog(budget)}>
                    <Pencil className="size-3.5" />
                    {t('edit')}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(budget.id)}>
                    {t('delete')}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{tPeriod(budget.period)}</p>
              <p className="mt-3 text-neutral-900">
                {t('spent')}: {budgetPeriod.spentMinor} / {budgetPeriod.allocatedMinor}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t('edit') : t('create')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="categoryId">{t('categoryLabel')}</Label>
              <Select
                items={categoryItems}
                value={categoryId || undefined}
                onValueChange={(value) => setCategoryId(value === '__none__' || value === null ? '' : value)}
                disabled={!!editingId}
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
              <Select
                items={periodItems}
                value={period}
                onValueChange={(value) => setPeriod(value as (typeof PERIODS)[number])}
                disabled={!!editingId}
              >
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
              <Input
                id="startsOn"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                disabled={!!editingId}
                required
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="rollover" checked={rollover} onCheckedChange={setRollover} />
              <Label htmlFor="rollover" className="mb-0">{t('rolloverLabel')}</Label>
            </div>
            <DialogFooter>
              <Button type="submit">{editingId ? t('saveChanges') : t('submit')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
