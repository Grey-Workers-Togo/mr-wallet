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

const DEFAULT_OPENING_BALANCE_AT = () => new Date().toISOString().slice(0, 10);

export default function AccountsPage() {
  const t = useTranslations('accounts');
  const tType = useTranslations('account.type');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');

  const currencies = useCurrencies();
  const typeItems = Object.fromEntries(ACCOUNT_TYPES.map((value) => [value, tType(value)]));
  const currencyItems = Object.fromEntries(currencies.map((c) => [c.code, c.code]));

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>('BANK');
  const [currency, setCurrency] = useState('XOF');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceAt, setOpeningBalanceAt] = useState(DEFAULT_OPENING_BALANCE_AT);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

  async function loadAccounts() {
    const list = await apiClient.get<Account[]>('/accounts');
    setAccounts(list);
  }

  useEffect(() => {
    loadAccounts().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function openCreateDialog() {
    setEditingId(null);
    setName('');
    setType('BANK');
    setCurrency('XOF');
    setOpeningBalance('0');
    setOpeningBalanceAt(DEFAULT_OPENING_BALANCE_AT());
    setDialogOpen(true);
  }

  function openEditDialog(account: Account) {
    setEditingId(account.id);
    setName(account.name);
    setType(account.type);
    setCurrency(account.currency);
    setOpeningBalance(account.openingBalanceMinor);
    setOpeningBalanceAt(DEFAULT_OPENING_BALANCE_AT());
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        // type/currency/opening balance are immutable after creation (docs/03-modele-donnees.md)
        await apiClient.patch(`/accounts/${editingId}`, { name });
      } else {
        await apiClient.post('/accounts', {
          name,
          type,
          currency,
          openingBalanceMinor: openingBalance,
          openingBalanceAt,
          includeInNetWorth: true,
        });
      }
      setDialogOpen(false);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/accounts/${id}`);
      await loadAccounts();
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

      {accounts === null && <p className="text-neutral-600">...</p>}
      {accounts?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {accounts && accounts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium text-neutral-900">{account.name}</h3>
                <Badge>{tType(account.type)}</Badge>
              </div>
              <p className="mt-3 text-2xl font-semibold text-neutral-900">
                {account.currentBalanceMinor} <span className="text-base font-normal text-neutral-600">{account.currency}</span>
              </p>
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => openEditDialog(account)}>
                  <Pencil className="size-3.5" />
                  {t('edit')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete({ id: account.id, label: account.name })}
                >
                  {t('delete')}
                </Button>
              </div>
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
              <Label htmlFor="type">{t('typeLabel')}</Label>
              <Select
                items={typeItems}
                value={type}
                onValueChange={(value) => setType(value as (typeof ACCOUNT_TYPES)[number])}
                disabled={!!editingId}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tType(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">{t('currencyLabel')}</Label>
              <Select
                items={currencyItems}
                value={currency}
                onValueChange={(value) => setCurrency(value ?? '')}
                disabled={!!editingId}
              >
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
              <Label htmlFor="openingBalance">{t('openingBalanceLabel')}</Label>
              <AmountInput
                id="openingBalance"
                value={openingBalance}
                onValueChange={setOpeningBalance}
                disabled={!!editingId}
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
                disabled={!!editingId}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit">{editingId ? t('saveChanges') : t('submit')}</Button>
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
