'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';

interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  baseCurrency: string;
  locale: string;
  timezone: string;
  weekStartsOn: number;
  monthStartDay: number;
  pinEnabled: boolean;
  pinLockMinutes: number;
}

interface PushDevice {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
}

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
}

export default function PreferencesPage() {
  const t = useTranslations('preferences');
  const tError = useTranslations('error');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [pin, setPin] = useState('');
  const [pinLockMinutes, setPinLockMinutes] = useState(5);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    const [me, deviceList] = await Promise.all([
      apiClient.get<Profile>('/me'),
      apiClient.get<PushDevice[]>('/notifications/push/devices'),
    ]);
    setProfile(me);
    setPinLockMinutes(me.pinLockMinutes);
    setDevices(deviceList);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR'));
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
    }
  }

  async function onSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    const form = new FormData(e.currentTarget);
    await run(async () => {
      await apiClient.patch('/me', {
        displayName: (form.get('displayName') as string) || undefined,
        locale: form.get('locale') as string,
        timezone: form.get('timezone') as string,
        weekStartsOn: Number(form.get('weekStartsOn')),
        monthStartDay: Number(form.get('monthStartDay')),
      });
      await loadAll();
    });
  }

  async function onSetPin(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await apiClient.post('/me/pin', { pin, lockMinutes: pinLockMinutes });
      setPin('');
      await loadAll();
    });
  }

  async function onRemovePin() {
    await run(async () => {
      await apiClient.delete('/me/pin');
      await loadAll();
    });
  }

  async function onEnablePush() {
    await run(async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const { publicKey } = await apiClient.get<{ publicKey: string }>('/notifications/push/public-key');
      if (!publicKey) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON();
      await apiClient.post('/notifications/push/subscribe', {
        endpoint: json.endpoint,
        p256dhKey: json.keys?.p256dh,
        authKey: json.keys?.auth,
      });
      await loadAll();
    });
  }

  async function onRemoveDevice(id: string) {
    await run(async () => {
      await apiClient.delete(`/notifications/push/devices/${id}`);
      await loadAll();
    });
  }

  async function onTestPush() {
    await run(() => apiClient.post('/notifications/push/test', {}));
  }

  async function onDeleteAccount() {
    await run(() => apiClient.delete('/me'));
  }

  return (
    <main>
      <h1>{t('title')}</h1>
      {error && <p role="alert">{tError(error as never)}</p>}
      {!profile && <p>...</p>}

      {profile && (
        <>
          <form onSubmit={onSaveProfile}>
            <label>
              {t('displayNameLabel')}
              <input name="displayName" defaultValue={profile.displayName ?? ''} />
            </label>
            <label>
              {t('localeLabel')}
              <select name="locale" defaultValue={profile.locale}>
                <option value="fr-FR">Français</option>
                <option value="en-US">English</option>
              </select>
            </label>
            <label>
              {t('timezoneLabel')}
              <input name="timezone" defaultValue={profile.timezone} />
            </label>
            <label>
              {t('weekStartsOnLabel')}
              <input name="weekStartsOn" type="number" min={0} max={6} defaultValue={profile.weekStartsOn} />
            </label>
            <label>
              {t('monthStartDayLabel')}
              <input name="monthStartDay" type="number" min={1} max={31} defaultValue={profile.monthStartDay} />
            </label>
            <button type="submit">{t('save')}</button>
          </form>

          <section>
            <h2>{t('pinSection')}</h2>
            <p>{profile.pinEnabled ? t('pinEnabled') : t('pinDisabled')}</p>
            <form onSubmit={onSetPin}>
              <label>
                {t('pinLabel')}
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  pattern="\d{4,8}"
                  minLength={4}
                  maxLength={8}
                  required
                />
              </label>
              <label>
                {t('pinLockMinutesLabel')}
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={pinLockMinutes}
                  onChange={(e) => setPinLockMinutes(Number(e.target.value))}
                />
              </label>
              <button type="submit">{t('setPin')}</button>
            </form>
            {profile.pinEnabled && (
              <button type="button" onClick={onRemovePin}>
                {t('removePin')}
              </button>
            )}
          </section>

          <section>
            <h2>{t('pushSection')}</h2>
            {devices?.length === 0 && <p>{t('pushEmpty')}</p>}
            {devices && devices.length > 0 && (
              <ul>
                {devices.map((d) => (
                  <li key={d.id}>
                    {d.deviceLabel ?? d.id}
                    <button type="button" onClick={() => onRemoveDevice(d.id)}>
                      {t('pushRemove')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={onEnablePush}>
              {t('pushEnable')}
            </button>
            <button type="button" onClick={onTestPush}>
              {t('pushTest')}
            </button>
          </section>

          <section>
            <h2>{t('deleteAccountSection')}</h2>
            <button type="button" onClick={onDeleteAccount}>
              {t('deleteAccount')}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
