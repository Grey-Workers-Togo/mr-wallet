'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/useToast';
import { PageLoader } from '@/components/shared/PageLoader';

interface Notification {
  id: string;
  type: string;
  params: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tType = useTranslations('notifications.type');
  const tError = useTranslations('error');
  const tCommon = useTranslations('common');

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  async function load() {
    const list = await apiClient.get<Notification[]>('/notifications');
    setNotifications(list);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  function renderMessage(notification: Notification): string {
    const known = [
      'BUDGET_THRESHOLD',
      'BUDGET_EXCEEDED',
      'DEBT_DUE_SOON',
      'DEBT_OVERDUE',
      'DEBT_PAID_OFF',
      'GOAL_REACHED',
      'RECURRENCE_DUE',
      'IMPORT_COMPLETED',
      'IMPORT_FAILED',
      'BALANCE_MISMATCH',
    ];
    if (!known.includes(notification.type)) return tType('UNKNOWN');
    return tType(notification.type as never, notification.params as never);
  }

  async function onMarkRead(id: string) {
    setError(null);
    setMarkingId(id);
    try {
      await apiClient.post(`/notifications/${id}/read`, {});
      await load();
      toast({ title: tCommon('updateSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setMarkingId(null);
    }
  }

  async function onMarkAllRead() {
    setError(null);
    setMarkingAll(true);
    try {
      await apiClient.post('/notifications/read-all', {});
      await load();
      toast({ title: tCommon('updateSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
        <Button type="button" variant="secondary" size="sm" loading={markingAll} onClick={onMarkAllRead}>
          {t('markAllRead')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {notifications === null && <PageLoader />}
      {notifications?.length === 0 && <p className="text-neutral-600">{t('empty')}</p>}
      {notifications && notifications.length > 0 && (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card key={notification.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {!notification.readAt && <Badge variant="info">•</Badge>}
                <div>
                  <p className="text-neutral-900">{renderMessage(notification)}</p>
                  <p className="text-sm text-neutral-600">{notification.createdAt.slice(0, 10)}</p>
                </div>
              </div>
              {!notification.readAt && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={markingId === notification.id}
                  onClick={() => onMarkRead(notification.id)}
                >
                  ✓
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
