'use client';

import { useEffect, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Target, CheckCircle2, PiggyBank } from 'lucide-react';
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
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useCurrencies } from '@/hooks/useCurrencies';
import { toast } from '@/hooks/useToast';
import { PageLoader } from '@/components/shared/PageLoader';

interface Goal {
  id: string;
  name: string;
  targetMinor: string;
  currentMinor: string;
  currency: string;
  targetDate: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
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

export default function GoalsPage() {
  const t = useTranslations('goals');
  const tStatus = useTranslations('goals.status');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');
  const tCommon = useTranslations('common');

  const currencies = useCurrencies();
  const minorUnitsByCode = Object.fromEntries(currencies.map((c) => [c.code, c.minorUnits]));

  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [targetMinor, setTargetMinor] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionDate, setContributionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contributionError, setContributionError] = useState<string | null>(null);
  const [isSubmittingContribution, setIsSubmittingContribution] = useState(false);

  async function loadAll() {
    setGoals(await apiClient.get<Goal[]>('/goals'));
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function openCreateDialog() {
    setEditingId(null);
    setName('');
    setTargetMinor('');
    setTargetDate('');
    setDialogOpen(true);
  }

  function openEditDialog(goal: Goal) {
    setEditingId(goal.id);
    setName(goal.name);
    setTargetMinor(goal.targetMinor);
    setTargetDate(goal.targetDate ? goal.targetDate.slice(0, 10) : '');
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (editingId) {
        await apiClient.patch(`/goals/${editingId}`, {
          name,
          targetMinor,
          targetDate: targetDate || undefined,
        });
      } else {
        await apiClient.post('/goals', {
          name,
          targetMinor,
          currency: 'XOF',
          targetDate: targetDate || undefined,
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
      await apiClient.delete(`/goals/${id}`);
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

  function openContributeDialog(goal: Goal) {
    setContributionError(null);
    setContributionAmount('');
    setContributionDate(new Date().toISOString().slice(0, 10));
    setContributeGoal(goal);
  }

  async function onSubmitContribution(e: FormEvent) {
    e.preventDefault();
    if (!contributeGoal) return;
    setContributionError(null);
    setIsSubmittingContribution(true);
    try {
      await apiClient.post(`/goals/${contributeGoal.id}/contributions`, {
        amountMinor: contributionAmount,
        contributedAt: contributionDate,
      });
      setContributeGoal(null);
      await loadAll();
      toast({ title: tCommon('updateSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setContributionError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setIsSubmittingContribution(false);
    }
  }

  const displayCurrency = goals?.[0]?.currency ?? 'XOF';
  const displayMinorUnits = minorUnitsByCode[displayCurrency] ?? 0;
  const totalSavedMinor = (goals ?? []).reduce((sum, g) => sum + BigInt(g.currentMinor), 0n);
  const totalTargetMinor = (goals ?? []).reduce((sum, g) => sum + BigInt(g.targetMinor), 0n);
  const goalsInProgress = (goals ?? []).filter((g) => g.status === 'ACTIVE').length;
  const goalsReached = (goals ?? []).filter((g) => g.status === 'COMPLETED').length;
  const totalPct = totalTargetMinor > 0n ? Math.round(Number((totalSavedMinor * 10000n) / totalTargetMinor) / 100) : 0;

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

      {goals && (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('totalSaved')}</div>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                {formatMinor(totalSavedMinor, displayCurrency, displayMinorUnits)}
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {totalTargetMinor > 0n
                  ? t('pctOfTarget', { pct: totalPct, amount: formatMinor(totalTargetMinor, displayCurrency, displayMinorUnits) })
                  : t('noTargetDefined')}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('goalsInProgress')}</div>
              <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-blue-600">
                <Target className="size-5" />
                {goalsInProgress}
              </p>
            </Card>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration: 0.3 }}>
            <Card className="p-5">
              <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('goalsReached')}</div>
              <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-emerald-600">
                <CheckCircle2 className="size-5" />
                {goalsReached}
              </p>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {goals === null && <PageLoader />}

      {goals?.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card className="flex flex-col items-center justify-center gap-1 py-12 text-center">
            <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{t('emptyTitle')}</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('emptySubtitle')}</p>
          </Card>
        </motion.div>
      )}

      {goals && goals.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence initial={false}>
            {goals.map((goal) => {
              const minorUnits = minorUnitsByCode[goal.currency] ?? 0;
              const target = BigInt(goal.targetMinor);
              const current = BigInt(goal.currentMinor);
              const pct = target > 0n ? Math.min(100, Number((current * 10000n) / target) / 100) : 0;
              const remaining = target > current ? target - current : 0n;
              return (
                <motion.div key={goal.id} layout variants={fadeUp} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
                  <Card className="p-0">
                    <div className="flex items-start justify-between gap-2 p-5 pb-0">
                      <div className="flex items-center gap-2">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                          <PiggyBank className="size-4" />
                        </div>
                        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{goal.name}</h3>
                      </div>
                      <Badge variant="secondary">{tStatus(goal.status)}</Badge>
                    </div>
                    <div className="px-5 pt-4">
                      <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
                        <span>{t('progress')}</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={`h-full rounded-full ${goal.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
                        <span>{formatMinor(current, goal.currency, minorUnits)}</span>
                        <span>{formatMinor(target, goal.currency, minorUnits)}</span>
                      </div>
                      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {goal.targetDate
                          ? t('remainingWithDate', {
                              amount: formatMinor(remaining, goal.currency, minorUnits),
                              date: goal.targetDate.slice(0, 10),
                            })
                          : t('remainingNoDate', {
                              amount: formatMinor(remaining, goal.currency, minorUnits),
                              noDate: t('noTargetDate'),
                            })}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 rounded-b-xl bg-muted/50 p-3">
                      <Button type="button" size="sm" onClick={() => openContributeDialog(goal)} disabled={goal.status !== 'ACTIVE'}>
                        <Plus className="size-3.5" />
                        {t('contribute')}
                      </Button>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('edit')} onClick={() => openEditDialog(goal)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('delete')}
                          onClick={() => setConfirmDelete({ id: goal.id, label: goal.name })}
                        >
                          <Trash2 className="size-3.5 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
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
              <Label htmlFor="targetMinor" required>{t('targetLabel')}</Label>
              <AmountInput id="targetMinor" value={targetMinor} onValueChange={setTargetMinor} required />
            </div>
            <div>
              <Label htmlFor="targetDate">{t('targetDateLabel')}</Label>
              <Input id="targetDate" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" loading={isSubmitting}>
                {editingId ? t('saveChanges') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!contributeGoal} onOpenChange={(open) => !open && setContributeGoal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('contributeTitle')}</DialogTitle>
          </DialogHeader>
          {contributionError && (
            <Alert variant="destructive">
              <AlertDescription>{tError(contributionError as never)}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onSubmitContribution} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="contributionAmount" required>{t('contributeAmountLabel')}</Label>
              <AmountInput id="contributionAmount" value={contributionAmount} onValueChange={setContributionAmount} required />
            </div>
            <div>
              <Label htmlFor="contributionDate" required>{t('contributeDateLabel')}</Label>
              <Input
                id="contributionDate"
                type="date"
                value={contributionDate}
                onChange={(e) => setContributionDate(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" loading={isSubmittingContribution}>
                {t('contributeSubmit')}
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
