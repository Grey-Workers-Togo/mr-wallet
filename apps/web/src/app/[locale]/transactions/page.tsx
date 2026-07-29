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

const TX_TYPES = ['EXPENSE', 'INCOME'] as const;

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
  type: (typeof TX_TYPES)[number];
  amountMinor: string;
  currency: string;
  occurredAt: string;
  description: string;
  categoryId: string | null;
  transferGroupId: string | null;
}

export default function TransactionsPage() {
  const t = useTranslations('transactions');
  const tType = useTranslations('transactions.type');
  const tCategoryType = useTranslations('category.type');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<(typeof TX_TYPES)[number]>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferAt, setTransferAt] = useState(() => new Date().toISOString().slice(0, 10));

  async function loadAll() {
    const [accountList, categoryList, txPage] = await Promise.all([
      apiClient.get<Account[]>('/accounts'),
      apiClient.get<Category[]>('/categories'),
      apiClient.get<{ items: Transaction[] }>('/transactions?limit=50'),
    ]);
    setAccounts(accountList);
    setCategories(categoryList);
    setTransactions(txPage.items);
    const firstAccount = accountList[0];
    if (firstAccount) {
      const secondAccountId = accountList[1]?.id ?? firstAccount.id;
      setAccountId((current) => current || firstAccount.id);
      setFromAccountId((current) => current || firstAccount.id);
      setToAccountId((current) => current || secondAccountId);
    }
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function resolveCategoryName(category: Category): string {
    if (category.name) return category.name;
    if (category.i18nKey) return tCategoryType(category.i18nKey.replaceAll('.', '_') as never);
    return '';
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/transactions', {
        accountId,
        type,
        amountMinor: amount,
        occurredAt,
        description,
        categoryId: categoryId || undefined,
      });
      setDescription('');
      setAmount('');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onTransfer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/transactions/transfer', {
        fromAccountId,
        toAccountId,
        amountMinor: transferAmount,
        occurredAt: transferAt,
        description: 'Transfer',
      });
      setTransferAmount('');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/transactions/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  const availableCategories = categories.filter((c) => c.kind === type);
  const accountItems = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const typeItems = Object.fromEntries(TX_TYPES.map((value) => [value, tType(value)]));
  const categoryItems = Object.fromEntries([
    ['__none__', t('noCategory')],
    ...availableCategories.map((c) => [c.id, resolveCategoryName(c)]),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {transactions === null && <p className="text-neutral-600">...</p>}
      {transactions?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {transactions && transactions.length > 0 && (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <Card key={tx.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-600">{tx.occurredAt.slice(0, 10)}</p>
                <p className="text-neutral-900">
                  {tx.description} — {tType(tx.type)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-semibold text-neutral-900">
                  {tx.amountMinor} {tx.currency}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete({ id: tx.id, label: tx.description })}
                >
                  {t('delete')}
                </Button>
              </div>
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
              <Label htmlFor="type">{t('typeLabel')}</Label>
              <Select items={typeItems} value={type} onValueChange={(value) => setType(value as (typeof TX_TYPES)[number])}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TX_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tType(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="amount">{t('amountLabel')}</Label>
              <AmountInput id="amount" value={amount} onValueChange={setAmount} required />
            </div>
            <div>
              <Label htmlFor="occurredAt">{t('occurredAtLabel')}</Label>
              <Input id="occurredAt" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
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
            <div className="md:col-span-2">
              <Button type="submit">{t('submit')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t('transferTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={onTransfer} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="fromAccountId">{t('fromAccountLabel')}</Label>
              <Select items={accountItems} value={fromAccountId} onValueChange={(value) => setFromAccountId(value ?? '')}>
                <SelectTrigger id="fromAccountId" className="w-full">
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
              <Label htmlFor="toAccountId">{t('toAccountLabel')}</Label>
              <Select items={accountItems} value={toAccountId} onValueChange={(value) => setToAccountId(value ?? '')}>
                <SelectTrigger id="toAccountId" className="w-full">
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
              <Label htmlFor="transferAmount">{t('amountLabel')}</Label>
              <AmountInput id="transferAmount" value={transferAmount} onValueChange={setTransferAmount} required />
            </div>
            <div>
              <Label htmlFor="transferAt">{t('occurredAtLabel')}</Label>
              <Input id="transferAt" type="date" value={transferAt} onChange={(e) => setTransferAt(e.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">{t('transferSubmit')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
