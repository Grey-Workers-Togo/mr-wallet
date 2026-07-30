'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Banknote } from 'lucide-react';
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

const DIRECTIONS = ['OWED_BY_ME', 'OWED_TO_ME'] as const;

interface DebtInstallment {
  id: string;
  sequence: number;
  dueOn: string;
  totalMinor: string;
  status: 'SCHEDULED' | 'PAID' | 'PARTIAL' | 'LATE' | 'SKIPPED';
}

interface Debt {
  id: string;
  name: string;
  direction: (typeof DIRECTIONS)[number];
  outstandingPrincipalMinor: string;
  principalMinor: string;
  currency: string;
  status: string;
  annualRatePct: string | null;
  termMonths: number | null;
  startedOn: string;
  linkedAccountId: string | null;
}

interface Account {
  id: string;
  name: string;
}

export default function DebtsPage() {
  const t = useTranslations('debts');
  const tDirection = useTranslations('debts.direction');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');

  const directionItems = Object.fromEntries(DIRECTIONS.map((value) => [value, tDirection(value)]));

  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>('OWED_BY_ME');
  const [principalMinor, setPrincipalMinor] = useState('');
  const [annualRatePct, setAnnualRatePct] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

  const [paymentDialogDebt, setPaymentDialogDebt] = useState<Debt | null>(null);
  const [paymentInstallments, setPaymentInstallments] = useState<DebtInstallment[]>([]);
  const [paidAt, setPaidAt] = useState('');
  const [paymentAmountMinor, setPaymentAmountMinor] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [isExtraPayment, setIsExtraPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function loadAll() {
    const [debtsList, accountsList] = await Promise.all([
      apiClient.get<Debt[]>('/debts'),
      apiClient.get<Account[]>('/accounts'),
    ]);
    setDebts(debtsList);
    setAccounts(accountsList);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function openCreateDialog() {
    setEditingId(null);
    setName('');
    setDirection('OWED_BY_ME');
    setPrincipalMinor('');
    setAnnualRatePct('');
    setTermMonths('');
    setStartedOn('');
    setLinkedAccountId('');
    setDialogOpen(true);
  }

  function openEditDialog(debt: Debt) {
    setEditingId(debt.id);
    setName(debt.name);
    setDirection(debt.direction);
    setPrincipalMinor(debt.principalMinor);
    setLinkedAccountId(debt.linkedAccountId ?? '');
    setAnnualRatePct(debt.annualRatePct ?? '');
    setTermMonths(debt.termMonths ? String(debt.termMonths) : '');
    setStartedOn(debt.startedOn.slice(0, 10));
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        // direction/principalMinor/annualRatePct/termMonths/startedOn are immutable after creation
        await apiClient.patch(`/debts/${editingId}`, {
          name,
          linkedAccountId: linkedAccountId || null,
        });
      } else {
        await apiClient.post('/debts', {
          name,
          direction,
          principalMinor,
          currency: 'XOF',
          rateType: annualRatePct ? 'FIXED' : 'ZERO',
          annualRatePct: annualRatePct ? Number(annualRatePct) : undefined,
          termMonths: termMonths ? Number(termMonths) : undefined,
          startedOn,
          paymentFrequency: 'MONTHLY',
          linkedAccountId: linkedAccountId || undefined,
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
      await apiClient.delete(`/debts/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function openPaymentDialog(debt: Debt) {
    setPaymentError(null);
    setPaidAt(new Date().toISOString().slice(0, 10));
    setPaymentAmountMinor('');
    setInstallmentId('');
    setIsExtraPayment(false);
    setPaymentDialogDebt(debt);
    try {
      const installments = await apiClient.get<DebtInstallment[]>(`/debts/${debt.id}/schedule`);
      setPaymentInstallments(installments.filter((i) => i.status !== 'PAID'));
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onSubmitPayment(e: FormEvent) {
    e.preventDefault();
    if (!paymentDialogDebt) return;
    setPaymentError(null);
    try {
      await apiClient.post(`/debts/${paymentDialogDebt.id}/payments`, {
        paidAt,
        amountMinor: paymentAmountMinor,
        installmentId: isExtraPayment ? undefined : installmentId || undefined,
        isExtraPayment,
      });
      setPaymentDialogDebt(null);
      await loadAll();
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
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

      {debts === null && <p className="text-neutral-600">...</p>}
      {debts?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {debts && debts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {debts.map((debt) => (
            <Card key={debt.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium text-neutral-900">{debt.name}</h3>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => openEditDialog(debt)}>
                    <Pencil className="size-3.5" />
                    {t('edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDelete({ id: debt.id, label: debt.name })}
                  >
                    {t('delete')}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{tDirection(debt.direction)}</p>
              <p className="mt-3 text-neutral-900">
                {t('outstanding')}: {debt.outstandingPrincipalMinor} {debt.currency}
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4 w-full"
                onClick={() => openPaymentDialog(debt)}
                disabled={debt.status !== 'ACTIVE'}
              >
                <Banknote className="size-3.5" />
                {t('recordPayment')}
              </Button>
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
              <Label htmlFor="direction">{t('directionLabel')}</Label>
              <Select
                items={directionItems}
                value={direction}
                onValueChange={(value) => setDirection(value as (typeof DIRECTIONS)[number])}
                disabled={!!editingId}
              >
                <SelectTrigger id="direction" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tDirection(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="principalMinor">{t('principalLabel')}</Label>
              <AmountInput
                id="principalMinor"
                value={principalMinor}
                onValueChange={setPrincipalMinor}
                disabled={!!editingId}
                required
              />
            </div>
            <div>
              <Label htmlFor="annualRatePct">{t('rateLabel')}</Label>
              <Input
                id="annualRatePct"
                type="number"
                min={0}
                step="0.01"
                value={annualRatePct}
                onChange={(e) => setAnnualRatePct(e.target.value)}
                disabled={!!editingId}
              />
            </div>
            <div>
              <Label htmlFor="termMonths">{t('termLabel')}</Label>
              <Input
                id="termMonths"
                type="number"
                min={1}
                step={1}
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                disabled={!!editingId}
              />
            </div>
            <div>
              <Label htmlFor="startedOn">{t('startedOnLabel')}</Label>
              <Input
                id="startedOn"
                type="date"
                value={startedOn}
                onChange={(e) => setStartedOn(e.target.value)}
                disabled={!!editingId}
                required
              />
            </div>
            <div>
              <Label htmlFor="linkedAccountId">{t('linkedAccountLabel')}</Label>
              <Select
                items={{
                  '': t('noLinkedAccountOption'),
                  ...Object.fromEntries(accounts.map((a) => [a.id, a.name])),
                }}
                value={linkedAccountId}
                onValueChange={(value) => setLinkedAccountId(value ?? '')}
              >
                <SelectTrigger id="linkedAccountId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('noLinkedAccountOption')}</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit">{editingId ? t('saveChanges') : t('submit')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentDialogDebt} onOpenChange={(open) => !open && setPaymentDialogDebt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('recordPayment')}</DialogTitle>
          </DialogHeader>
          {paymentError && (
            <Alert variant="destructive">
              <AlertDescription>{tError(paymentError as never)}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onSubmitPayment} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="paidAt">{t('paidAtLabel')}</Label>
              <Input id="paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="paymentAmountMinor">{t('amountLabel')}</Label>
              <AmountInput
                id="paymentAmountMinor"
                value={paymentAmountMinor}
                onValueChange={setPaymentAmountMinor}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isExtraPayment"
                checked={isExtraPayment}
                onCheckedChange={(checked) => setIsExtraPayment(checked === true)}
              />
              <Label htmlFor="isExtraPayment">{t('extraPaymentLabel')}</Label>
            </div>
            {!isExtraPayment && (
              <div>
                <Label htmlFor="installmentId">{t('installmentLabel')}</Label>
                <Select
                  items={Object.fromEntries(
                    paymentInstallments.map((i) => [
                      i.id,
                      `#${i.sequence} · ${i.dueOn.slice(0, 10)} · ${i.totalMinor} ${paymentDialogDebt?.currency ?? ''}`,
                    ]),
                  )}
                  value={installmentId}
                  onValueChange={(value) => setInstallmentId(value ?? '')}
                >
                  <SelectTrigger id="installmentId" className="w-full">
                    <SelectValue placeholder={t('noInstallmentsOption')} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentInstallments.map((installment) => (
                      <SelectItem key={installment.id} value={installment.id}>
                        #{installment.sequence} · {installment.dueOn.slice(0, 10)} · {installment.totalMinor}{' '}
                        {paymentDialogDebt?.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="submit">{t('recordPaymentSubmit')}</Button>
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
