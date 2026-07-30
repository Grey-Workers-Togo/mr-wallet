'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Repeat, Check } from 'lucide-react';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from '@/components/ui/badge';
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
import { useCurrencies } from '@/hooks/useCurrencies';

const FREQUENCIES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY'] as const;
const TYPES = ['EXPENSE', 'INCOME'] as const;

interface Account {
  id: string;
  name: string;
  currency: string;
}

interface Category {
  id: string;
  name: string | null;
  i18nKey: string | null;
  kind: 'EXPENSE' | 'INCOME' | 'TRANSFER';
}

interface RecurrenceRule {
  id: string;
  name: string;
  type: (typeof TYPES)[number];
  accountId: string;
  amountMinor: string;
  currency: string;
  frequency: (typeof FREQUENCIES)[number];
  autoCreate: boolean;
}

interface Upcoming {
  recurrenceId: string;
  name: string;
  occurrenceDate: string;
}

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

export default function RecurrencesPage() {
  const t = useTranslations('recurrences');
  const tType = useTranslations('recurrences.type');
  const tFrequency = useTranslations('recurrences.frequency');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');

  const currencies = useCurrencies();
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<RecurrenceRule[] | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]>('EXPENSE');
  const [currency, setCurrency] = useState('XOF');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>('MONTHLY');
  const [interval, setInterval] = useState('1');
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsOn, setEndsOn] = useState('');
  const [description, setDescription] = useState('');
  const [autoCreate, setAutoCreate] = useState(false);

  async function loadAll() {
    const [accountList, categoryList, ruleList, upcomingList] = await Promise.all([
      apiClient.get<Account[]>('/accounts'),
      apiClient.get<Category[]>('/categories'),
      apiClient.get<RecurrenceRule[]>('/recurrences'),
      apiClient.get<Upcoming[]>('/recurrences/upcoming?days=30'),
    ]);
    setAccounts(accountList);
    setCategories(categoryList);
    setRules(ruleList);
    setUpcoming(upcomingList);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function openCreateDialog() {
    setType('EXPENSE');
    setCurrency('XOF');
    setCategoryId('');
    setAccountId(accounts.find((a) => a.currency === currency)?.id ?? accounts[0]?.id ?? '');
    setAmountMinor('');
    setFrequency('MONTHLY');
    setInterval('1');
    setStartsOn(new Date().toISOString().slice(0, 10));
    setEndsOn('');
    setDescription('');
    setAutoCreate(false);
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/recurrences', {
        name: description,
        type,
        accountId,
        categoryId: categoryId || undefined,
        amountMinor,
        currency,
        frequency,
        interval: Number(interval) || 1,
        startsOn,
        endsOn: endsOn || undefined,
        autoCreate,
      });
      setDialogOpen(false);
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

  async function onMaterialize(recurrenceId: string, occurrenceDate: string) {
    setError(null);
    try {
      await apiClient.post(`/recurrences/${recurrenceId}/materialize`, { occurrenceDate });
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  function resolveCategoryName(category: Category): string {
    if (category.name) return category.name;
    if (category.i18nKey) return tCategoryType(category.i18nKey.replaceAll('.', '_') as never);
    return '';
  }

  const accountsInCurrency = accounts.filter((a) => a.currency === currency);
  const availableCategories = categories.filter((c) => c.kind === type);
  const typeItems = Object.fromEntries(TYPES.map((value) => [value, tType(value)]));
  const currencyItems = Object.fromEntries(currencies.map((c) => [c.code, c.code]));
  const accountItemsForCreate = Object.fromEntries(accountsInCurrency.map((a) => [a.id, a.name]));
  const categoryItems = Object.fromEntries([
    ['__none__', t('noCategory')],
    ...availableCategories.map((c) => [c.id, resolveCategoryName(c)]),
  ]);
  const frequencyItems = Object.fromEntries(FREQUENCIES.map((value) => [value, tFrequency(value)]));
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t('subtitle')}</p>
        </div>
        <Button type="button" onClick={openCreateDialog}>
          <Plus className="size-4" />
          {t('add')}
        </Button>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Alert variant="destructive">
              <AlertDescription>{tError(error as never)}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {rules === null && <p className="text-neutral-600">...</p>}

      {rules?.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Repeat className="size-5" />
            </div>
            <h2 className="text-lg font-medium text-neutral-900">{t('emptyTitle')}</h2>
            <p className="max-w-sm text-sm text-neutral-600">{t('emptySubtitle')}</p>
            <Button type="button" className="mt-2" onClick={openCreateDialog}>
              {t('createFirst')}
            </Button>
          </Card>
        </motion.div>
      )}

      {rules && rules.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-neutral-600">
                  <th className="px-5 py-3 font-medium">{t('columnName')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnAccount')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnFrequency')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnAmount')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {rules.map((rule, index) => {
                    const minorUnits = minorUnitsByCode[rule.currency] ?? 0;
                    const isNegative = rule.type === 'EXPENSE';
                    return (
                      <motion.tr
                        key={rule.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.25, delay: index * 0.03 }}
                        className="border-b last:border-0"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-neutral-900">{rule.name}</div>
                          <Badge variant="secondary" className="mt-1">{tType(rule.type)}</Badge>
                        </td>
                        <td className="px-5 py-3 text-neutral-600">{accountsById[rule.accountId]?.name ?? '-'}</td>
                        <td className="px-5 py-3 text-neutral-600">{tFrequency(rule.frequency)}</td>
                        <td className={`px-5 py-3 font-semibold ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
                          {isNegative ? '-' : '+'}
                          {formatMinor(rule.amountMinor, rule.currency, minorUnits)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t('delete')}
                              onClick={() => setConfirmDelete({ id: rule.id, label: rule.name })}
                            >
                              <Trash2 className="size-3.5 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </Card>
        </motion.div>
      )}

      {upcoming.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          <h2 className="text-lg font-medium text-neutral-900">{t('upcoming')}</h2>
          <Card className="divide-y p-0">
            {upcoming.map((item) => (
              <motion.div
                key={`${item.recurrenceId}-${item.occurrenceDate}`}
                variants={fadeUp}
                transition={{ duration: 0.25 }}
                className="flex items-center justify-between gap-2 p-4"
              >
                <p className="text-neutral-900">
                  {item.name} — {item.occurrenceDate.slice(0, 10)}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={() => onMaterialize(item.recurrenceId, item.occurrenceDate)}>
                  <Check className="size-3.5" />
                  {t('materialize')}
                </Button>
              </motion.div>
            ))}
          </Card>
        </motion.div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('create')}</DialogTitle>
            <DialogDescription>{t('createDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">{t('typeLabel')}</Label>
                <Select items={typeItems} value={type} onValueChange={(value) => setType(value as (typeof TYPES)[number])}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tType(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="amountMinor">{t('amountCurrencyLabel', { currency })}</Label>
                <AmountInput id="amountMinor" value={amountMinor} onValueChange={setAmountMinor} required />
              </div>
            </div>
            <div>
              <Label htmlFor="currency">{t('currencyLabel')}</Label>
              <Select items={currencyItems} value={currency} onValueChange={(value) => setCurrency(value ?? '')}>
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="categoryId">{t('categoryLabel')}</Label>
              <Select
                items={categoryItems}
                value={categoryId || undefined}
                onValueChange={(value) => setCategoryId(value === '__none__' || value === null ? '' : value)}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder={t('noCategory')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('noCategory')}</SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {resolveCategoryName(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="accountId">{t('accountLabel')}</Label>
              <Select items={accountItemsForCreate} value={accountId} onValueChange={(value) => setAccountId(value ?? '')}>
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountsInCurrency.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                <Label htmlFor="interval">{t('intervalLabel')}</Label>
                <Input id="interval" type="number" min={1} step={1} value={interval} onChange={(e) => setInterval(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startsOn">{t('startsOnLabel')}</Label>
                <Input id="startsOn" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="endsOn">{t('endsOnLabel')}</Label>
                <Input id="endsOn" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Input
                id="description"
                placeholder={t('descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit">{t('submit')}</Button>
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
