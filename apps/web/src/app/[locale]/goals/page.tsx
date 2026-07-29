'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

export default function GoalsPage() {
  const t = useTranslations('goals');
  const tStatus = useTranslations('goals.status');
  const tError = useTranslations('error');

  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [name, setName] = useState('');
  const [targetMinor, setTargetMinor] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setGoals(await apiClient.get<Goal[]>('/goals'));
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiClient.post('/goals', {
        name,
        targetMinor,
        currency: 'XOF',
        targetDate: targetDate || undefined,
      });
      setName('');
      setTargetMinor('');
      setTargetDate('');
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
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

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
              <div className="mt-3">
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(goal.id)}>
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
            <div className="md:col-span-2">
              <Button type="submit">{t('submit')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
