'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

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

  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    try {
      await apiClient.post(`/notifications/${id}/read`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onMarkAllRead() {
    setError(null);
    try {
      await apiClient.post('/notifications/read-all', {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  return (
    <main>
      <h1>{t('title')}</h1>
      {error && <p role="alert">{tError(error as never)}</p>}
      <button type="button" onClick={onMarkAllRead}>
        {t('markAllRead')}
      </button>

      {notifications === null && <p>...</p>}
      {notifications?.length === 0 && <p>{t('empty')}</p>}
      {notifications && notifications.length > 0 && (
        <ul>
          {notifications.map((notification) => (
            <li key={notification.id}>
              {renderMessage(notification)} — {notification.createdAt.slice(0, 10)}
              {!notification.readAt && (
                <button type="button" onClick={() => onMarkRead(notification.id)}>
                  ✓
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
