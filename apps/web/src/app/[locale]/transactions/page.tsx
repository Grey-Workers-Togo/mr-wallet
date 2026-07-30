'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Search, SlidersHorizontal, TrendingUp, TrendingDown, ArrowLeftRight, Scale } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useCurrencies } from '@/hooks/useCurrencies';

const CREATE_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER'] as const;
const FILTER_TYPES = ['ALL', 'EXPENSE', 'INCOME', 'TRANSFER'] as const;

interface Account {
  id: string;
  name: string;
  currency: string;
}

interface Category {
  id: string;
  parentId: string | null;
  name: string | null;
  i18nKey: string | null;
  kind: 'EXPENSE' | 'INCOME' | 'TRANSFER';
}

interface Transaction {
  id: string;
  accountId: string;
  type: 'EXPENSE' | 'INCOME';
  amountMinor: string;
  currency: string;
  occurredAt: string;
  description: string;
  categoryId: string | null;
  transferGroupId: string | null;
}

interface Summary {
  totalExpenseMinor: string;
  totalIncomeMinor: string;
  totalTransferMinor: string;
  transferTransactionCount: number;
}

const PAGE_SIZE = 20;

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

export default function TransactionsPage() {
  const t = useTranslations('transactions');
  const tType = useTranslations('transactions.type');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');

  const currencies = useCurrencies();
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<(typeof FILTER_TYPES)[number]>('ALL');
  const [filterAccountId, setFilterAccountId] = useState('__all__');
  const [filterCategoryId, setFilterCategoryId] = useState('__all__');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterMin, setFilterMin] = useState('');
  const [filterMax, setFilterMax] = useState('');
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [type, setType] = useState<(typeof CREATE_TYPES)[number]>('EXPENSE');
  const [currency, setCurrency] = useState('XOF');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  async function loadStatic() {
    const [accountList, categoryList] = await Promise.all([
      apiClient.get<Account[]>('/accounts'),
      apiClient.get<Category[]>('/categories'),
    ]);
    setAccounts(accountList);
    setCategories(categoryList);
    const firstAccount = accountList[0];
    if (firstAccount) {
      setAccountId((current) => current || firstAccount.id);
      setToAccountId((current) => current || accountList[1]?.id || firstAccount.id);
    }
  }

  function buildQuery(cursor: string | null) {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    if (cursor) params.set('cursor', cursor);
    if (filterType !== 'ALL') params.set('type', filterType);
    if (filterAccountId !== '__all__') params.set('accountId', filterAccountId);
    if (filterCategoryId !== '__all__') params.set('categoryId', filterCategoryId);
    if (filterFrom) params.set('from', filterFrom);
    if (filterTo) params.set('to', filterTo);
    if (filterMin) params.set('minAmountMinor', filterMin);
    if (filterMax) params.set('maxAmountMinor', filterMax);
    if (search.trim()) params.set('q', search.trim());
    return params.toString();
  }

  async function loadPage(cursor: string | null) {
    const [txPage, summaryResult] = await Promise.all([
      apiClient.get<{ items: Transaction[]; nextCursor: string | null }>(`/transactions?${buildQuery(cursor)}`),
      apiClient.get<Summary>('/transactions/summary'),
    ]);
    setTransactions(txPage.items);
    setNextCursor(txPage.nextCursor);
    setCurrentCursor(cursor);
    setSummary(summaryResult);
    setTotal((prevTotal) => (cursor === null ? txPage.items.length + (txPage.nextCursor ? 1 : 0) : prevTotal));
  }

  useEffect(() => {
    loadStatic().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  useEffect(() => {
    setCursorStack([]);
    loadPage(null).catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterAccountId, filterCategoryId, filterFrom, filterTo, filterMin, filterMax, search]);

  function resolveCategoryName(category: Category): string {
    if (category.name) return category.name;
    if (category.i18nKey) return tCategoryType(category.i18nKey.replaceAll('.', '_') as never);
    return '';
  }

  function openCreateDialog() {
    setType('EXPENSE');
    setCurrency('XOF');
    setAmount('');
    setCategoryId('');
    setOccurredAt(new Date().toISOString().slice(0, 10));
    setNotes('');
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (type === 'TRANSFER') {
        await apiClient.post('/transactions/transfer', {
          fromAccountId: accountId,
          toAccountId,
          amountMinor: amount,
          occurredAt,
          description: notes || 'Transfer',
        });
      } else {
        await apiClient.post('/transactions', {
          accountId,
          type,
          amountMinor: amount,
          occurredAt,
          description: notes || '-',
          categoryId: categoryId || undefined,
        });
      }
      setDialogOpen(false);
      setCursorStack([]);
      await loadPage(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/transactions/${id}`);
      await loadPage(currentCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  function goNext() {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, currentCursor]);
    loadPage(nextCursor).catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }

  function goPrevious() {
    const stack = [...cursorStack];
    const previousCursor = stack.pop() ?? null;
    setCursorStack(stack);
    loadPage(previousCursor).catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }

  function resetFilters() {
    setFilterType('ALL');
    setFilterAccountId('__all__');
    setFilterCategoryId('__all__');
    setFilterFrom('');
    setFilterTo('');
    setFilterMin('');
    setFilterMax('');
    setFiltersDialogOpen(false);
  }

  const availableCategories = categories.filter((c) => c.kind === (type === 'TRANSFER' ? 'EXPENSE' : type));
  const accountsInCurrency = accounts.filter((a) => a.currency === currency);
  const accountItems = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const createAccountItems = Object.fromEntries(accountsInCurrency.map((a) => [a.id, a.name]));
  const typeItems = Object.fromEntries(CREATE_TYPES.map((value) => [value, tType(value)]));
  const filterTypeItems = Object.fromEntries(FILTER_TYPES.map((value) => [value, value === 'ALL' ? t('filtersAllTypes') : tType(value)]));
  const currencyItems = Object.fromEntries(currencies.map((c) => [c.code, c.code]));
  const categoryItems = Object.fromEntries([
    ['__none__', t('noCategory')],
    ...availableCategories.map((c) => [c.id, resolveCategoryName(c)]),
  ]);
  const categoriesByAccount = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const displayCurrency = accounts[0]?.currency ?? 'XOF';
  const displayMinorUnits = minorUnitsByCode[displayCurrency] ?? 0;

  const netMinor = summary ? BigInt(summary.totalIncomeMinor) - BigInt(summary.totalExpenseMinor) : 0n;

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
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Alert variant="destructive">
              <AlertDescription>{tError(error as never)}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {summary && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <Scale className="size-4" />
                {t('netBalance')}
              </div>
              <p className={`mt-2 text-2xl font-semibold ${netMinor < 0n ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatMinor(netMinor, displayCurrency, displayMinorUnits)}
              </p>
              <div className="mt-1 flex gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-600">
                  <TrendingUp className="size-3" />+{formatMinor(summary.totalIncomeMinor, displayCurrency, displayMinorUnits)}
                </span>
                <span className="flex items-center gap-1 text-red-600">
                  <TrendingDown className="size-3" />-{formatMinor(summary.totalExpenseMinor, displayCurrency, displayMinorUnits)}
                </span>
              </div>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <TrendingUp className="size-4" />
                {t('totalIncome')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                {formatMinor(summary.totalIncomeMinor, displayCurrency, displayMinorUnits)}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <TrendingDown className="size-4" />
                {t('totalExpense')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-red-600">
                {formatMinor(summary.totalExpenseMinor, displayCurrency, displayMinorUnits)}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <ArrowLeftRight className="size-4" />
                {t('totalTransfers')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-blue-600">
                {formatMinor(summary.totalTransferMinor, displayCurrency, displayMinorUnits)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">{t('transferCount', { count: summary.transferTransactionCount })}</p>
            </Card>
          </motion.div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
      <Card className="p-0">
        <div className="border-b p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-neutral-900">{t('listTitle')}</h2>
            <Badge variant="secondary">{transactions?.length ?? 0}</Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {t('listSubtitle', { visible: transactions?.length ?? 0, total })}
          </p>
        </div>
        <div className="flex gap-2 border-b p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => setFiltersDialogOpen(true)}>
            <SlidersHorizontal className="size-4" />
            {t('filters')}
          </Button>
        </div>

        {transactions === null && <p className="p-5 text-neutral-600">...</p>}
        {transactions?.length === 0 && <p className="p-5 text-neutral-600">{t('empty')}</p>}
        {transactions && transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-neutral-600">
                  <th className="px-5 py-3 font-medium">{t('columnDate')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnLabel')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnAccount')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnCategory')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnType')}</th>
                  <th className="px-5 py-3 font-medium">{t('columnAmount')}</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                {transactions.map((tx, index) => {
                  const account = accountsById.get(tx.accountId);
                  const category = tx.categoryId ? categoriesByAccount.get(tx.categoryId) : null;
                  const isTransfer = !!tx.transferGroupId;
                  const minorUnits = minorUnitsByCode[tx.currency] ?? 0;
                  const isNegative = tx.type === 'EXPENSE';
                  return (
                    <motion.tr
                      key={tx.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.25, delay: index * 0.02 }}
                      className="border-b last:border-0"
                    >
                      <td className="px-5 py-3 text-neutral-600">{tx.occurredAt.slice(0, 10)}</td>
                      <td className="px-5 py-3 font-medium text-neutral-900">{tx.description || '-'}</td>
                      <td className="px-5 py-3 text-neutral-600">{account?.name ?? '-'}</td>
                      <td className="px-5 py-3">
                        {category ? <Badge variant="secondary">{resolveCategoryName(category)}</Badge> : <span className="text-neutral-400">-</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="secondary">{isTransfer ? tType('TRANSFER') : tType(tx.type)}</Badge>
                      </td>
                      <td className={`px-5 py-3 font-semibold ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isNegative ? '-' : '+'}
                        {formatMinor(tx.amountMinor, tx.currency, minorUnits)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('edit')}
                            disabled={isTransfer}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('delete')}
                            onClick={() => setConfirmDelete({ id: tx.id, label: tx.description })}
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
          </div>
        )}

        <div className="flex items-center justify-between border-t p-4 text-sm text-neutral-600">
          <span>{t('paginationRange', { from: 1, to: transactions?.length ?? 0, total })}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={cursorStack.length === 0} onClick={goPrevious}>
              {t('previous')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!nextCursor} onClick={goNext}>
              {t('next')}
            </Button>
          </div>
        </div>
      </Card>
      </motion.div>

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
                <Select items={typeItems} value={type} onValueChange={(value) => setType(value as (typeof CREATE_TYPES)[number])}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATE_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tType(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="amount">{t('amountCurrencyLabel', { currency })}</Label>
                <AmountInput id="amount" value={amount} onValueChange={setAmount} required />
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
            {type !== 'TRANSFER' && (
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
            )}
            <div>
              <Label htmlFor="accountId">{type === 'TRANSFER' ? t('fromAccountLabel') : t('accountLabel')}</Label>
              <Select
                items={createAccountItems}
                value={accountId}
                onValueChange={(value) => setAccountId(value ?? '')}
              >
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue placeholder={t('noAccount')} />
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
            {type === 'TRANSFER' && (
              <div>
                <Label htmlFor="toAccountId">{t('toAccountLabel')}</Label>
                <Select items={createAccountItems} value={toAccountId} onValueChange={(value) => setToAccountId(value ?? '')}>
                  <SelectTrigger id="toAccountId" className="w-full">
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
            )}
            <div>
              <Label htmlFor="occurredAt">{t('occurredAtLabel')}</Label>
              <Input id="occurredAt" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="notes">{t('noteLabel')}</Label>
              <Textarea id="notes" placeholder={t('notePlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit">{t('submit')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={filtersDialogOpen} onOpenChange={setFiltersDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('filters')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="filterType">{t('typeLabel')}</Label>
              <Select items={filterTypeItems} value={filterType} onValueChange={(value) => setFilterType((value ?? 'ALL') as (typeof FILTER_TYPES)[number])}>
                <SelectTrigger id="filterType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === 'ALL' ? t('filtersAllTypes') : tType(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filterCategoryId">{t('categoryLabel')}</Label>
              <Select
                items={{ __all__: t('filtersAllCategories'), ...Object.fromEntries(categories.map((c) => [c.id, resolveCategoryName(c)])) }}
                value={filterCategoryId}
                onValueChange={(value) => setFilterCategoryId(value ?? '__all__')}
              >
                <SelectTrigger id="filterCategoryId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('filtersAllCategories')}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {resolveCategoryName(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filterAccountId">{t('accountLabel')}</Label>
              <Select
                items={{ __all__: t('filtersAllAccounts'), ...accountItems }}
                value={filterAccountId}
                onValueChange={(value) => setFilterAccountId(value ?? '__all__')}
              >
                <SelectTrigger id="filterAccountId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('filtersAllAccounts')}</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('periodLabel')}</Label>
              <div className="flex gap-2">
                <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
                <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </div>
            </div>
            <div className="col-span-2">
              <Label>{t('amountRangeLabel')}</Label>
              <div className="flex gap-2">
                <AmountInput value={filterMin} onValueChange={setFilterMin} placeholder={t('amountMinPlaceholder')} />
                <AmountInput value={filterMax} onValueChange={setFilterMax} placeholder={t('amountMaxPlaceholder')} />
              </div>
              <p className="mt-1 text-xs text-neutral-500">{t('amountRangeHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetFilters}>
              {t('resetFilters')}
            </Button>
            <Button type="button" onClick={() => setFiltersDialogOpen(false)}>
              {t('applyFilters')}
            </Button>
          </DialogFooter>
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
