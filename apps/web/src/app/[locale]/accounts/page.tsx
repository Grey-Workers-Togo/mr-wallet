'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
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
import { NAME_MAX_LENGTH, isValidAmount, isValidName, sanitizeNameInput } from '@/lib/validation';
import { toast } from '@/hooks/useToast';
import { PageLoader } from '@/components/shared/PageLoader';

const ACCOUNT_TYPES = ['CASH', 'BANK', 'MOBILE_MONEY', 'CREDIT_CARD', 'SAVINGS', 'WALLET', 'OTHER'] as const;

interface Account {
  id: string;
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  currency: string;
  openingBalanceMinor: string;
  currentBalanceMinor: string;
  entriesMinor: string;
  exitsMinor: string;
}

const DEFAULT_OPENING_BALANCE_AT = () => new Date().toISOString().slice(0, 10);

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

function formatMinor(amountMinor: string | number, currency: string, minorUnits: number) {
  const value = Number(amountMinor) / 10 ** minorUnits;
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: minorUnits > 0 ? minorUnits : 0,
    maximumFractionDigits: minorUnits > 0 ? minorUnits : 0,
  }).format(value);
  return `${formatted} ${currency}`;
}

export default function AccountsPage() {
  const t = useTranslations('accounts');
  const tType = useTranslations('account.type');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');
  const tCommon = useTranslations('common');

  const currencies = useCurrencies();
  const typeItems = Object.fromEntries(ACCOUNT_TYPES.map((value) => [value, tType(value)]));
  const currencyItems = Object.fromEntries(currencies.map((c) => [c.code, c.code]));
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    if (!isValidName(name) || (!editingId && !isValidAmount(openingBalance))) {
      setError('VALIDATION_FAILED');
      return;
    }
    setError(null);
    setIsSubmitting(true);
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
      await apiClient.delete(`/accounts/${id}`);
      await loadAccounts();
      toast({ title: tCommon('deleteSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  }

  const totalBalanceMinor = (accounts ?? []).reduce((sum, a) => sum + BigInt(a.currentBalanceMinor), 0n);
  const totalEntriesMinor = (accounts ?? []).reduce((sum, a) => sum + BigInt(a.entriesMinor ?? '0'), 0n);
  const totalExitsMinor = (accounts ?? []).reduce((sum, a) => sum + BigInt(a.exitsMinor ?? '0'), 0n);
  const displayCurrency = accounts?.[0]?.currency ?? 'XOF';
  const displayMinorUnits = minorUnitsByCode[displayCurrency] ?? 0;

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

      {accounts && accounts.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <Wallet className="size-4" />
                {t('totalBalance')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                {formatMinor(totalBalanceMinor.toString(), displayCurrency, displayMinorUnits)}
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('accountsCount', { count: accounts.length })}</p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <TrendingUp className="size-4" />
                {t('totalEntries')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                {formatMinor(totalEntriesMinor.toString(), displayCurrency, displayMinorUnits)}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <TrendingDown className="size-4" />
                {t('totalExits')}
              </div>
              <p className="mt-2 text-2xl font-semibold text-red-600">
                {formatMinor(totalExitsMinor.toString(), displayCurrency, displayMinorUnits)}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {accounts === null && <PageLoader />}
      {accounts?.length === 0 && <p className="text-neutral-600 dark:text-neutral-400">{t('empty')}</p>}
      {accounts && accounts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-neutral-600 dark:text-neutral-400">
                <th className="px-5 py-3 font-medium">{t('columnName')}</th>
                <th className="px-5 py-3 font-medium">{t('columnType')}</th>
                <th className="px-5 py-3 font-medium">{t('columnCurrency')}</th>
                <th className="px-5 py-3 font-medium">{t('columnEntries')}</th>
                <th className="px-5 py-3 font-medium">{t('columnExits')}</th>
                <th className="px-5 py-3 font-medium">{t('columnBalance')}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
              {accounts.map((account, index) => {
                const minorUnits = minorUnitsByCode[account.currency] ?? 0;
                return (
                  <motion.tr
                    key={account.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.25, delay: index * 0.03 }}
                    className="border-b last:border-0"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-100">
                        <Wallet className="size-4 text-neutral-500 dark:text-neutral-400" />
                        {account.name}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary">{tType(account.type)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">{account.currency}</td>
                    <td className="px-5 py-3 text-emerald-600">
                      +{formatMinor(account.entriesMinor ?? '0', account.currency, minorUnits)}
                    </td>
                    <td className="px-5 py-3 text-red-600">
                      -{formatMinor(account.exitsMinor ?? '0', account.currency, minorUnits)}
                    </td>
                    <td className="px-5 py-3 font-semibold text-emerald-600">
                      {formatMinor(account.currentBalanceMinor, account.currency, minorUnits)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('edit')}
                          onClick={() => openEditDialog(account)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('delete')}
                          onClick={() => setConfirmDelete({ id: account.id, label: account.name })}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t('edit') : t('create')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="name" required>{t('nameLabel')}</Label>
              <Input
                id="name"
                placeholder={t('namePlaceholder')}
                value={name}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) => setName(sanitizeNameInput(e.target.value))}
                required
              />
            </div>
            <div>
              <Label htmlFor="openingBalance" required>{t('openingBalanceLabel')}</Label>
              <AmountInput
                id="openingBalance"
                value={openingBalance}
                onValueChange={setOpeningBalance}
                disabled={!!editingId}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type" required>{t('typeLabel')}</Label>
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
                <Label htmlFor="currency" required>{t('currencyLabel')}</Label>
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
            </div>
            <div>
              <Label htmlFor="openingBalanceAt" required>{t('openingBalanceAtLabel')}</Label>
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
