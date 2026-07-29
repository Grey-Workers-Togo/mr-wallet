'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { clearLocalPin, setLocalPin } from '@/lib/local-pin';
import { purgeOfflineCache } from '@/lib/offline-cache';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  const [locale, setLocale] = useState('fr-FR');
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    const [me, deviceList] = await Promise.all([
      apiClient.get<Profile>('/me'),
      apiClient.get<PushDevice[]>('/notifications/push/devices'),
    ]);
    setProfile(me);
    setPinLockMinutes(me.pinLockMinutes);
    setLocale(me.locale);
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
        locale,
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
      await setLocalPin(pin);
      setPin('');
      await loadAll();
    });
  }

  async function onRemovePin() {
    await run(async () => {
      await apiClient.delete('/me/pin');
      await clearLocalPin();
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
    await run(async () => {
      await apiClient.delete('/me');
      await clearLocalPin();
      await purgeOfflineCache();
    });
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tError(error as never)}</AlertDescription>
        </Alert>
      )}

      {!profile && <p className="text-neutral-600">...</p>}

      {profile && (
        <>
          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle>{t('title')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <form onSubmit={onSaveProfile} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="displayName">{t('displayNameLabel')}</Label>
                  <Input id="displayName" name="displayName" defaultValue={profile.displayName ?? ''} />
                </div>
                <div>
                  <Label htmlFor="locale">{t('localeLabel')}</Label>
                  <Select value={locale} onValueChange={(value) => setLocale(value ?? '')}>
                    <SelectTrigger id="locale" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr-FR">Français</SelectItem>
                      <SelectItem value="en-US">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="timezone">{t('timezoneLabel')}</Label>
                  <Input id="timezone" name="timezone" defaultValue={profile.timezone} />
                </div>
                <div>
                  <Label htmlFor="weekStartsOn">{t('weekStartsOnLabel')}</Label>
                  <Input id="weekStartsOn" name="weekStartsOn" type="number" min={0} max={6} defaultValue={profile.weekStartsOn} />
                </div>
                <div>
                  <Label htmlFor="monthStartDay">{t('monthStartDayLabel')}</Label>
                  <Input
                    id="monthStartDay"
                    name="monthStartDay"
                    type="number"
                    min={1}
                    max={31}
                    defaultValue={profile.monthStartDay}
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit">{t('save')}</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle>{t('pinSection')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              <p className="text-neutral-600">{profile.pinEnabled ? t('pinEnabled') : t('pinDisabled')}</p>
              <form onSubmit={onSetPin} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="pin">{t('pinLabel')}</Label>
                  <Input
                    id="pin"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    pattern="\d{4,8}"
                    minLength={4}
                    maxLength={8}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pinLockMinutes">{t('pinLockMinutesLabel')}</Label>
                  <Input
                    id="pinLockMinutes"
                    type="number"
                    min={1}
                    max={60}
                    value={pinLockMinutes}
                    onChange={(e) => setPinLockMinutes(Number(e.target.value))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit">{t('setPin')}</Button>
                </div>
              </form>
              {profile.pinEnabled && (
                <Button type="button" variant="destructive" size="sm" onClick={onRemovePin}>
                  {t('removePin')}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle>{t('pushSection')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              {devices?.length === 0 && <p className="text-neutral-600">{t('pushEmpty')}</p>}
              {devices && devices.length > 0 && (
                <div className="space-y-2">
                  {devices.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                      <span className="text-neutral-900">{d.deviceLabel ?? d.id}</span>
                      <Button type="button" variant="destructive" size="sm" onClick={() => onRemoveDevice(d.id)}>
                        {t('pushRemove')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={onEnablePush}>
                  {t('pushEnable')}
                </Button>
                <Button type="button" variant="secondary" onClick={onTestPush}>
                  {t('pushTest')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle>{t('deleteAccountSection')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Button type="button" variant="destructive" onClick={onDeleteAccount}>
                {t('deleteAccount')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
