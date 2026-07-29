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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const DIRECTIONS = ['OWED_BY_ME', 'OWED_TO_ME'] as const;

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
}

export default function DebtsPage() {
  const t = useTranslations('debts');
  const tDirection = useTranslations('debts.direction');
  const tError = useTranslations('error');

  const directionItems = Object.fromEntries(DIRECTIONS.map((value) => [value, tDirection(value)]));

  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>('OWED_BY_ME');
  const [principalMinor, setPrincipalMinor] = useState('');
  const [annualRatePct, setAnnualRatePct] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [startedOn, setStartedOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setDebts(await apiClient.get<Debt[]>('/debts'));
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
    setDialogOpen(true);
  }

  function openEditDialog(debt: Debt) {
    setEditingId(debt.id);
    setName(debt.name);
    setDirection(debt.direction);
    setPrincipalMinor(debt.principalMinor);
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
        await apiClient.patch(`/debts/${editingId}`, { name });
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
                  <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(debt.id)}>
                    {t('delete')}
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{tDirection(debt.direction)}</p>
              <p className="mt-3 text-neutral-900">
                {t('outstanding')}: {debt.outstandingPrincipalMinor} {debt.currency}
              </p>
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
            <DialogFooter>
              <Button type="submit">{editingId ? t('saveChanges') : t('submit')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
