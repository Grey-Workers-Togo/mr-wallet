'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Banknote, X, History, Undo2 } from 'lucide-react';
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
import { EmptyState } from '@/components/shared/EmptyState';
import { submitOnCtrlEnter } from '@/lib/form-shortcuts';
import { SubmitShortcutHint } from '@/components/shared/SubmitShortcutHint';

const DIRECTIONS = ['OWED_BY_ME', 'OWED_TO_ME'] as const;
const TERM_UNITS = ['DAYS', 'WEEKS', 'MONTHS'] as const;
const SCHEDULE_MODES = ['AUTO', 'MANUAL'] as const;
const TERM_UNIT_DAYS: Record<(typeof TERM_UNITS)[number], number> = { DAYS: 1, WEEKS: 7, MONTHS: 30 };

interface ManualInstallmentRow {
  dueOn: string;
  totalMinor: string;
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

interface DebtInstallment {
  id: string;
  sequence: number;
  dueOn: string;
  totalMinor: string;
  status: 'SCHEDULED' | 'PAID' | 'PARTIAL' | 'LATE' | 'SKIPPED';
}

interface DebtPayment {
  id: string;
  paidAt: string;
  amountMinor: string;
  isExtraPayment: boolean;
  installmentId: string | null;
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
  termDays: number | null;
  scheduleMode: (typeof SCHEDULE_MODES)[number];
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
  const tCommon = useTranslations('common');

  const tTermUnit = useTranslations('debts.termUnit');
  const tScheduleMode = useTranslations('debts.scheduleMode');

  const directionItems = Object.fromEntries(DIRECTIONS.map((value) => [value, tDirection(value)]));
  const termUnitItems = Object.fromEntries(TERM_UNITS.map((value) => [value, tTermUnit(value)]));
  const scheduleModeItems = Object.fromEntries(SCHEDULE_MODES.map((value) => [value, tScheduleMode(value)]));
  const currencies = useCurrencies();
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>('OWED_BY_ME');
  const [principalMinor, setPrincipalMinor] = useState('');
  const [annualRatePct, setAnnualRatePct] = useState('');
  const [termValue, setTermValue] = useState('');
  const [termUnit, setTermUnit] = useState<(typeof TERM_UNITS)[number]>('MONTHS');
  const [useExactDueDate, setUseExactDueDate] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [scheduleMode, setScheduleMode] = useState<(typeof SCHEDULE_MODES)[number]>('AUTO');
  const [manualInstallments, setManualInstallments] = useState<ManualInstallmentRow[]>([{ dueOn: '', totalMinor: '' }]);
  const [startedOn, setStartedOn] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [paymentDialogDebt, setPaymentDialogDebt] = useState<Debt | null>(null);
  const [paymentInstallments, setPaymentInstallments] = useState<DebtInstallment[]>([]);
  const [paidAt, setPaidAt] = useState('');
  const [paymentAmountMinor, setPaymentAmountMinor] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [isExtraPayment, setIsExtraPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const [paymentsHistoryDebt, setPaymentsHistoryDebt] = useState<Debt | null>(null);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [confirmRevertPayment, setConfirmRevertPayment] = useState<{ debtId: string; paymentId: string } | null>(null);
  const [isRevertingPayment, setIsRevertingPayment] = useState(false);

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
    setFormStep(1);
    setEditingId(null);
    setName('');
    setDirection('OWED_BY_ME');
    setPrincipalMinor('');
    setAnnualRatePct('');
    setTermValue('');
    setTermUnit('MONTHS');
    setUseExactDueDate(false);
    setDueDate('');
    setScheduleMode('AUTO');
    setManualInstallments([{ dueOn: '', totalMinor: '' }]);
    setStartedOn('');
    setLinkedAccountId('');
    setDialogOpen(true);
  }

  function openEditDialog(debt: Debt) {
    setFormStep(1);
    setEditingId(debt.id);
    setName(debt.name);
    setDirection(debt.direction);
    setPrincipalMinor(debt.principalMinor);
    setLinkedAccountId(debt.linkedAccountId ?? '');
    setAnnualRatePct(debt.annualRatePct ?? '');
    setTermValue(debt.termDays ? String(debt.termDays) : '');
    setTermUnit('DAYS');
    setUseExactDueDate(false);
    setDueDate('');
    setScheduleMode(debt.scheduleMode);
    setManualInstallments([{ dueOn: '', totalMinor: '' }]);
    setStartedOn(debt.startedOn.slice(0, 10));
    setDialogOpen(true);
  }

  function addManualInstallmentRow() {
    setManualInstallments((rows) => [...rows, { dueOn: '', totalMinor: '' }]);
  }

  function removeManualInstallmentRow(index: number) {
    setManualInstallments((rows) => rows.filter((_, i) => i !== index));
  }

  function updateManualInstallmentRow(index: number, patch: Partial<ManualInstallmentRow>) {
    setManualInstallments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function goToNextStep() {
    setFormStep(2);
  }

  function goToPreviousStep() {
    setFormStep(1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (formStep === 1) {
      goToNextStep();
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (editingId) {
        // direction/principalMinor/annualRatePct/termDays/scheduleMode/startedOn are immutable after creation
        await apiClient.patch(`/debts/${editingId}`, {
          name,
          linkedAccountId: linkedAccountId || null,
        });
      } else {
        const isManual = scheduleMode === 'MANUAL';
        const termDays = isManual
          ? undefined
          : useExactDueDate
            ? dueDate
              ? Math.round((new Date(dueDate).getTime() - new Date(startedOn).getTime()) / 86_400_000)
              : undefined
            : termValue
              ? Number(termValue) * TERM_UNIT_DAYS[termUnit]
              : undefined;

        await apiClient.post('/debts', {
          name,
          direction,
          principalMinor,
          currency: 'XOF',
          rateType: isManual ? 'ZERO' : annualRatePct ? 'FIXED' : 'ZERO',
          annualRatePct: isManual || !annualRatePct ? undefined : Number(annualRatePct),
          termDays,
          scheduleMode,
          manualInstallments: isManual
            ? manualInstallments
                .filter((row) => row.dueOn && row.totalMinor)
                .map((row) => ({ dueOn: row.dueOn, totalMinor: row.totalMinor }))
            : undefined,
          startedOn,
          paymentFrequency: 'MONTHLY',
          linkedAccountId: linkedAccountId || undefined,
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
      await apiClient.delete(`/debts/${id}`);
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
    setIsSubmittingPayment(true);
    try {
      await apiClient.post(`/debts/${paymentDialogDebt.id}/payments`, {
        paidAt,
        amountMinor: paymentAmountMinor,
        installmentId: isExtraPayment ? undefined : installmentId || undefined,
        isExtraPayment,
      });
      setPaymentDialogDebt(null);
      await loadAll();
      toast({ title: tCommon('updateSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setPaymentError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsSubmittingPayment(false);
    }
  }

  async function openPaymentsHistory(debt: Debt) {
    setPaymentsHistoryDebt(debt);
    try {
      const list = await apiClient.get<DebtPayment[]>(`/debts/${debt.id}/payments`);
      setDebtPayments(list);
    } catch (err) {
      toast({
        title: tCommon('actionErrorTitle'),
        description: tError((err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR') as never),
        variant: 'destructive',
      });
    }
  }

  async function onRevertPayment() {
    if (!confirmRevertPayment) return;
    setIsRevertingPayment(true);
    try {
      await apiClient.delete(`/debts/${confirmRevertPayment.debtId}/payments/${confirmRevertPayment.paymentId}`);
      setDebtPayments((rows) => rows.filter((p) => p.id !== confirmRevertPayment.paymentId));
      await loadAll();
      toast({ title: tCommon('deleteSuccessTitle'), variant: 'success' });
    } catch (err) {
      toast({
        title: tCommon('actionErrorTitle'),
        description: tError((err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR') as never),
        variant: 'destructive',
      });
    } finally {
      setIsRevertingPayment(false);
      setConfirmRevertPayment(null);
    }
  }

  const displayCurrency = debts?.[0]?.currency ?? 'XOF';
  const displayMinorUnits = minorUnitsByCode[displayCurrency] ?? 0;
  const owedToMeMinor = (debts ?? [])
    .filter((d) => d.direction === 'OWED_TO_ME')
    .reduce((sum, d) => sum + BigInt(d.outstandingPrincipalMinor), 0n);
  const owedByMeMinor = (debts ?? [])
    .filter((d) => d.direction === 'OWED_BY_ME')
    .reduce((sum, d) => sum + BigInt(d.outstandingPrincipalMinor), 0n);
  const netMinor = owedToMeMinor - owedByMeMinor;

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

      {debts && debts.length > 0 && (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('owedToMe')}</div>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                +{formatMinor(owedToMeMinor, displayCurrency, displayMinorUnits)}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('owedByMe')}</div>
              <p className="mt-2 text-2xl font-semibold text-red-600">
                -{formatMinor(owedByMeMinor, displayCurrency, displayMinorUnits)}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('netBalance')}</div>
              <p className={`mt-2 text-2xl font-semibold ${netMinor < 0n ? 'text-red-600' : 'text-emerald-600'}`}>
                {netMinor < 0n ? '-' : '+'}
                {formatMinor(netMinor < 0n ? -netMinor : netMinor, displayCurrency, displayMinorUnits)}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {debts === null && <PageLoader />}
      {debts?.length === 0 && (
        <EmptyState
          title={t('emptyGuideTitle')}
          description={t('emptyGuideDescription')}
          cta={{ label: t('emptyGuideCta'), onClick: openCreateDialog }}
        />
      )}
      {debts && debts.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence initial={false}>
          {debts.map((debt) => (
            <motion.div
              key={debt.id}
              layout
              variants={fadeUp}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
            <Card className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{debt.name}</h3>
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
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{tDirection(debt.direction)}</p>
              <p className="mt-3 text-neutral-900 dark:text-neutral-100">
                {t('outstanding')}: {debt.outstandingPrincipalMinor} {debt.currency}
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onClick={() => openPaymentDialog(debt)}
                  disabled={debt.status !== 'ACTIVE'}
                >
                  <Banknote className="size-3.5" />
                  {t('recordPayment')}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => openPaymentsHistory(debt)}>
                  <History className="size-3.5" />
                  {t('viewPayments')}
                </Button>
              </div>
            </Card>
            </motion.div>
          ))}
          </AnimatePresence>
        </motion.div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('edit') : t('create')} · {formStep === 1 ? t('stepMainInfoTitle') : t('stepDatesTitle')} (
              {formStep}/2)
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} onKeyDown={submitOnCtrlEnter} className="grid grid-cols-1 gap-4">
            {formStep === 1 && (
              <>
                <div>
                  <Label htmlFor="name" required>{t('nameLabel')}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="direction" required>{t('directionLabel')}</Label>
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
                  <Label htmlFor="principalMinor" required>{t('principalLabel')}</Label>
                  <AmountInput
                    id="principalMinor"
                    value={principalMinor}
                    onValueChange={setPrincipalMinor}
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
              </>
            )}

            {formStep === 2 && (
              <>
            <div>
              <Label htmlFor="startedOn" required>{t('startedOnLabel')}</Label>
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
              <Label htmlFor="scheduleMode">{t('scheduleModeLabel')}</Label>
              <Select
                items={scheduleModeItems}
                value={scheduleMode}
                onValueChange={(value) => setScheduleMode(value as (typeof SCHEDULE_MODES)[number])}
                disabled={!!editingId}
              >
                <SelectTrigger id="scheduleMode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_MODES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tScheduleMode(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {scheduleMode === 'AUTO' && (
              <>
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
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="useExactDueDate"
                    checked={useExactDueDate}
                    onCheckedChange={(checked) => setUseExactDueDate(checked === true)}
                    disabled={!!editingId}
                  />
                  <Label htmlFor="useExactDueDate">{t('useExactDueDateLabel')}</Label>
                </div>
                {useExactDueDate ? (
                  <div>
                    <Label htmlFor="dueDate">{t('dueDateLabel')}</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      disabled={!!editingId}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="termValue">{t('termLabel')}</Label>
                      <Input
                        id="termValue"
                        type="number"
                        min={1}
                        step={1}
                        value={termValue}
                        onChange={(e) => setTermValue(e.target.value)}
                        disabled={!!editingId}
                      />
                    </div>
                    <div>
                      <Label htmlFor="termUnit">{t('termUnitLabel')}</Label>
                      <Select
                        items={termUnitItems}
                        value={termUnit}
                        onValueChange={(value) => setTermUnit(value as (typeof TERM_UNITS)[number])}
                        disabled={!!editingId}
                      >
                        <SelectTrigger id="termUnit" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TERM_UNITS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {tTermUnit(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </>
            )}

            {scheduleMode === 'MANUAL' && !editingId && (
              <div>
                <Label>{t('manualInstallmentsLabel')}</Label>
                <div className="mt-2 space-y-2">
                  {manualInstallments.map((row, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label htmlFor={`manualDueOn-${index}`} className="text-xs">
                          {t('manualInstallmentDueDateLabel')}
                        </Label>
                        <Input
                          id={`manualDueOn-${index}`}
                          type="date"
                          value={row.dueOn}
                          onChange={(e) => updateManualInstallmentRow(index, { dueOn: e.target.value })}
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`manualAmount-${index}`} className="text-xs">
                          {t('manualInstallmentAmountLabel')}
                        </Label>
                        <AmountInput
                          id={`manualAmount-${index}`}
                          value={row.totalMinor}
                          onValueChange={(value) => updateManualInstallmentRow(index, { totalMinor: value })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label={t('removeInstallmentRow')}
                        onClick={() => removeManualInstallmentRow(index)}
                        disabled={manualInstallments.length <= 1}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={addManualInstallmentRow}>
                  <Plus className="size-3.5" />
                  {t('addInstallmentRow')}
                </Button>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                  {t('manualScheduleSumHint', {
                    sum: manualInstallments.reduce((acc, row) => {
                      try {
                        return row.totalMinor ? acc + BigInt(row.totalMinor) : acc;
                      } catch {
                        return acc;
                      }
                    }, 0n).toString(),
                    principal: principalMinor || '0',
                  })}
                </p>
              </div>
            )}
              </>
            )}

            <DialogFooter>
              {formStep === 2 && (
                <Button type="button" variant="secondary" onClick={goToPreviousStep}>
                  {tCommon('back')}
                </Button>
              )}
              {formStep === 1 ? (
                <Button type="submit">{tCommon('next')}</Button>
              ) : (
                <Button type="submit" loading={isSubmitting}>
                  {editingId ? t('saveChanges') : t('submit')}
                </Button>
              )}
            </DialogFooter>
            <SubmitShortcutHint />
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
          <form onSubmit={onSubmitPayment} onKeyDown={submitOnCtrlEnter} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="paidAt" required>{t('paidAtLabel')}</Label>
              <Input id="paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="paymentAmountMinor" required>{t('amountLabel')}</Label>
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
              <Button type="submit" loading={isSubmittingPayment}>
                {t('recordPaymentSubmit')}
              </Button>
            </DialogFooter>
            <SubmitShortcutHint />
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentsHistoryDebt} onOpenChange={(open) => !open && setPaymentsHistoryDebt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('paymentsHistoryTitle')}</DialogTitle>
          </DialogHeader>
          {debtPayments.length === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('noPaymentsYet')}</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {debtPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {formatMinor(
                        payment.amountMinor,
                        paymentsHistoryDebt?.currency ?? 'XOF',
                        minorUnitsByCode[paymentsHistoryDebt?.currency ?? 'XOF'] ?? 0,
                      )}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {payment.paidAt.slice(0, 10)}
                      {payment.isExtraPayment ? ` · ${t('extraPaymentBadge')}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      paymentsHistoryDebt &&
                      setConfirmRevertPayment({ debtId: paymentsHistoryDebt.id, paymentId: payment.id })
                    }
                  >
                    <Undo2 className="size-3.5" />
                    {t('revertPayment')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmRevertPayment} onOpenChange={(open) => !open && setConfirmRevertPayment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('revertPaymentConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('revertPaymentConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tConfirm('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={isRevertingPayment} onClick={onRevertPayment}>
              {tConfirm('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
