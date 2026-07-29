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
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface Goal {
  id: string;
  name: string;
  targetMinor: string;
  currentMinor: string;
  currency: string;
  targetDate: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

export default function GoalsPage() {
  const t = useTranslations('goals');
  const tStatus = useTranslations('goals.status');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');

  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [targetMinor, setTargetMinor] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

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
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/goals/${id}`);
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

      {goals === null && <p className="text-neutral-600">...</p>}
      {goals?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {goals && goals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <Card key={goal.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-medium text-neutral-900">{goal.name}</h3>
                <Badge>{tStatus(goal.status)}</Badge>
              </div>
              <p className="mt-3 text-neutral-900">
                {goal.currentMinor} / {goal.targetMinor} {goal.currency}
              </p>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => openEditDialog(goal)}>
                  <Pencil className="size-3.5" />
                  {t('edit')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete({ id: goal.id, label: goal.name })}
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
              <Label htmlFor="targetMinor">{t('targetLabel')}</Label>
              <AmountInput id="targetMinor" value={targetMinor} onValueChange={setTargetMinor} required />
            </div>
            <div>
              <Label htmlFor="targetDate">{t('targetDateLabel')}</Label>
              <Input id="targetDate" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
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
