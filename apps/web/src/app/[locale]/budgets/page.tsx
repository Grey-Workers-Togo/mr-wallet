'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, Gauge, Wallet } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrencies } from '@/hooks/useCurrencies';
import { toast } from '@/hooks/useToast';
import { PageLoader } from '@/components/shared/PageLoader';

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
  currency: string;
  period: (typeof PERIODS)[number];
  rollover: boolean;
}

interface CurrentBudget {
  budget: Budget;
  period: { allocatedMinor: string; spentMinor: string };
}

const DEFAULT_STARTS_ON = () => new Date().toISOString().slice(0, 10);

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

function formatMinor(amountMinor: string | bigint, currency: string, minorUnits: number) {
  const value = Number(amountMinor) / 10 ** minorUnits;
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: minorUnits > 0 ? minorUnits : 0,
    maximumFractionDigits: minorUnits > 0 ? minorUnits : 0,
  }).format(value);
  return `${formatted} ${currency}`;
}

export default function BudgetsPage() {
  const t = useTranslations('budgets');
  const tPeriod = useTranslations('budgets.period');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');
  const tCommon = useTranslations('common');

  const currencies = useCurrencies();
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

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
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setIsSubmitting(true);
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
      toast({ title: editingId ? tCommon('updateSuccessTitle') : tCommon('createSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    setError(null);
    setIsDeleting(true);
    try {
      await apiClient.delete(`/budgets/${id}`);
      await loadAll();
      toast({ title: tCommon('deleteSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  }

  const displayCurrency = current?.[0]?.budget.currency ?? 'XOF';
  const displayMinorUnits = minorUnitsByCode[displayCurrency] ?? 0;
  const totalAllocatedMinor = (current ?? []).reduce((sum, c) => sum + BigInt(c.period.allocatedMinor), 0n);
  const totalSpentMinor = (current ?? []).reduce((sum, c) => sum + BigInt(c.period.spentMinor), 0n);
  const totalRemainingMinor = totalAllocatedMinor - totalSpentMinor;
  const exceededCount = (current ?? []).filter((c) => BigInt(c.period.spentMinor) > BigInt(c.period.allocatedMinor)).length;
  const usagePct = totalAllocatedMinor > 0n ? Number((totalSpentMinor * 10000n) / totalAllocatedMinor) / 100 : 0;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t('subtitle')}</p>
        </div>
        <Button type="button" onClick={openCreateDialog} className="hidden md:inline-flex">
          <Plus className="size-4" />
          {t('add')}
        </Button>
      </motion.div>

      <Button
        type="button"
        onClick={openCreateDialog}
        aria-label={t('add')}
        className="fixed bottom-20 right-4 z-30 size-14 rounded-full p-0 shadow-lg md:hidden"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus className="size-6" />
      </Button>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Alert variant="destructive">
              <AlertDescription>{tError(error as never)}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {current && (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <Wallet className="size-4" />
                {t('totalBudget')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                {formatMinor(totalAllocatedMinor, displayCurrency, displayMinorUnits)}
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {t('totalSpent', { amount: formatMinor(totalSpentMinor, displayCurrency, displayMinorUnits) })}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                {exceededCount > 0 ? <AlertTriangle className="size-4 text-red-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
                {t('exceededBudgets')}
              </div>
              <p className={`mt-2 text-2xl font-semibold ${exceededCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {exceededCount} / {current.length}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <Gauge className="size-4" />
                {t('usageRate')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{Math.round(usagePct)}%</p>
              <p className="mt-1 text-xs text-emerald-600">
                {t('remainingAmount', { amount: formatMinor(totalRemainingMinor, displayCurrency, displayMinorUnits) })}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {current === null && <PageLoader />}

      {current && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]"
        >
          <Card className="p-5">
            <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{t('overviewTitle')}</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t('overviewSubtitle')}</p>
            {current.length === 0 ? (
              <p className="mt-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('overviewEmpty')}</p>
            ) : (
              <div className="mt-5 space-y-4">
                {current.map(({ budget, period: budgetPeriod }) => {
                  const allocated = BigInt(budgetPeriod.allocatedMinor);
                  const spent = BigInt(budgetPeriod.spentMinor);
                  const pct = allocated > 0n ? Math.min(100, Number((spent * 10000n) / allocated) / 100) : 0;
                  const exceeded = spent > allocated;
                  return (
                    <div key={budget.id}>
                      <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
                        <span>{budget.name}</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={`h-full rounded-full ${exceeded ? 'bg-red-500' : 'bg-emerald-500'}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            {current.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{t('listTitle')}</h2>
                <p className="mt-1 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">{t('listSubtitle')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {current.map(({ budget, period: budgetPeriod }, index) => (
                    <motion.div
                      key={budget.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.25, delay: index * 0.03 }}
                      className="rounded-lg border p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{budget.name}</h3>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400">{tPeriod(budget.period)}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('edit')} onClick={() => openEditDialog(budget)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('delete')}
                            onClick={() => setConfirmDelete({ id: budget.id, label: budget.name })}
                          >
                            <Trash2 className="size-3.5 text-red-600" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-3 text-neutral-900 dark:text-neutral-100">
                        {t('spent')}: {formatMinor(budgetPeriod.spentMinor, budget.currency, minorUnitsByCode[budget.currency] ?? 0)} /{' '}
                        {formatMinor(budgetPeriod.allocatedMinor, budget.currency, minorUnitsByCode[budget.currency] ?? 0)}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t('edit') : t('create')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="name" required>{t('nameLabel')}</Label>
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
              <Label htmlFor="amountMinor" required>{t('amountLabel')}</Label>
              <AmountInput id="amountMinor" value={amountMinor} onValueChange={setAmountMinor} required />
            </div>
            <div>
              <Label htmlFor="period" required>{t('periodLabel')}</Label>
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
              <Label htmlFor="startsOn" required>{t('startsOnLabel')}</Label>
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
              <Button type="submit" loading={isSubmitting}>
                {editingId ? t('saveChanges') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tConfirm('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tConfirm('deleteDescription', { name: confirmDelete?.label ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tConfirm('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={isDeleting}
              onClick={async () => {
                if (!confirmDelete) return;
                await onDelete(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              {tConfirm('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
