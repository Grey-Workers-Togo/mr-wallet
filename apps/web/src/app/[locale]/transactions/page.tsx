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

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && <Alert variant="error">{tError(error as never)}</Alert>}

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
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(tx.id)}>
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
              <Select id="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="type">{t('typeLabel')}</Label>
              <Select id="type" value={type} onChange={(e) => setType(e.target.value as (typeof TX_TYPES)[number])}>
                {TX_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {tType(value)}
                  </option>
                ))}
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
              <Select id="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t('noCategory')}</option>
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {resolveCategoryName(category)}
                  </option>
                ))}
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
              <Select id="fromAccountId" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="toAccountId">{t('toAccountLabel')}</Label>
              <Select id="toAccountId" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
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
    </div>
  );
}
