'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

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
    <main>
      <h1>{t('title')}</h1>

      {transactions === null && <p>...</p>}
      {transactions?.length === 0 && <p>{t('empty')}</p>}
      {transactions && transactions.length > 0 && (
        <ul>
          {transactions.map((tx) => (
            <li key={tx.id}>
              {tx.occurredAt.slice(0, 10)} — {tx.description} — {tType(tx.type)} — {tx.amountMinor} {tx.currency}
              <button type="button" onClick={() => onDelete(tx.id)}>
                {t('delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>{t('create')}</h2>
      <form onSubmit={onSubmit}>
        <label>
          {t('accountLabel')}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('typeLabel')}
          <select value={type} onChange={(e) => setType(e.target.value as (typeof TX_TYPES)[number])}>
            {TX_TYPES.map((value) => (
              <option key={value} value={value}>
                {tType(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('amountLabel')}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          {t('occurredAtLabel')}
          <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </label>
        <label>
          {t('descriptionLabel')}
          <input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label>
          {t('categoryLabel')}
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('noCategory')}</option>
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {resolveCategoryName(category)}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit">{t('submit')}</button>
      </form>

      <h2>{t('transferTitle')}</h2>
      <form onSubmit={onTransfer}>
        <label>
          {t('fromAccountLabel')}
          <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('toAccountLabel')}
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('amountLabel')}
          <input value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} required />
        </label>
        <label>
          {t('occurredAtLabel')}
          <input type="date" value={transferAt} onChange={(e) => setTransferAt(e.target.value)} required />
        </label>
        <button type="submit">{t('transferSubmit')}</button>
      </form>
    </main>
  );
}
