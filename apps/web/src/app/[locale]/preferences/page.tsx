'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { clearLocalPin, setLocalPin } from '@/lib/local-pin';
import { purgeOfflineCache } from '@/lib/offline-cache';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { toast } from '@/hooks/useToast';
import { PageLoader } from '@/components/shared/PageLoader';

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

/** Maps the profile's saved locale (fr-FR/en-US) to next-intl's routing locale segment (fr/en). */
const LOCALE_TO_ROUTE: Record<string, 'fr' | 'en'> = { 'fr-FR': 'fr', 'en-US': 'en' };

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
}

export default function PreferencesPage() {
  const t = useTranslations('preferences');
  const tError = useTranslations('error');
  const tConfirm = useTranslations('confirm');
  const tCommon = useTranslations('common');
  const activeRouteLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [pin, setPin] = useState('');
  const [pinLockMinutes, setPinLockMinutes] = useState(5);
  const [locale, setLocale] = useState('fr-FR');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'removePin' | 'deleteAccount' | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

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

  async function run(key: string, action: () => Promise<void>) {
    setError(null);
    setPending(key);
    try {
      await action();
      toast({ title: tCommon('updateSuccessTitle'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tCommon('actionErrorTitle'), description: tError(code as never), variant: 'destructive' });
    } finally {
      setPending(null);
    }
  }

  async function onSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    const form = new FormData(e.currentTarget);
    await run('profile', async () => {
      await apiClient.patch('/me', {
        displayName: (form.get('displayName') as string) || undefined,
        locale,
        timezone: form.get('timezone') as string,
        weekStartsOn: Number(form.get('weekStartsOn')),
        monthStartDay: Number(form.get('monthStartDay')),
      });
      await loadAll();
      const routeLocale = LOCALE_TO_ROUTE[locale];
      if (routeLocale && routeLocale !== activeRouteLocale) {
        router.replace(pathname, { locale: routeLocale });
      }
    });
  }

  async function onSetPin(e: FormEvent) {
    e.preventDefault();
    await run('setPin', async () => {
      await apiClient.post('/me/pin', { pin, lockMinutes: pinLockMinutes });
      await setLocalPin(pin);
      setPin('');
      await loadAll();
    });
  }

  async function onRemovePin() {
    await run('removePin', async () => {
      await apiClient.delete('/me/pin');
      await clearLocalPin();
      await loadAll();
    });
  }

  async function onEnablePush() {
    await run('enablePush', async () => {
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
    setRemovingDeviceId(id);
    await run('removeDevice', async () => {
      await apiClient.delete(`/notifications/push/devices/${id}`);
      await loadAll();
    });
    setRemovingDeviceId(null);
  }

  async function onTestPush() {
    await run('testPush', () => apiClient.post('/notifications/push/test', {}));
  }

  async function onDeleteAccount() {
    await run('deleteAccount', async () => {
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

      {!profile && <PageLoader />}

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
                  <Select
                    items={{ 'fr-FR': 'Français', 'en-US': 'English' }}
                    value={locale}
                    onValueChange={(value) => setLocale(value ?? '')}
                  >
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
                  <Button type="submit" loading={pending === 'profile'}>
                    {t('save')}
                  </Button>
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
                  <Label htmlFor="pin" required>{t('pinLabel')}</Label>
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
                  <Button type="submit" loading={pending === 'setPin'}>
                    {t('setPin')}
                  </Button>
                </div>
              </form>
              {profile.pinEnabled && (
                <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmAction('removePin')}>
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
                    <div
                      key={d.id}
                      className="flex flex-col items-start gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-neutral-900 break-all">{d.deviceLabel ?? d.id}</span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="w-full shrink-0 sm:w-auto"
                        onClick={() => setConfirmDelete({ id: d.id, label: d.deviceLabel ?? d.id })}
                      >
                        {t('pushRemove')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="w-full sm:w-auto" loading={pending === 'enablePush'} onClick={onEnablePush}>
                  {t('pushEnable')}
                </Button>
                <Button type="button" variant="secondary" className="w-full sm:w-auto" loading={pending === 'testPush'} onClick={onTestPush}>
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
              <Button type="button" variant="destructive" onClick={() => setConfirmAction('deleteAccount')}>
                {t('deleteAccount')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

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
              loading={removingDeviceId === confirmDelete?.id}
              onClick={async () => {
                if (!confirmDelete) return;
                await onRemoveDevice(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              {tConfirm('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tConfirm('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'deleteAccount'
                ? tConfirm('deleteDescription', { name: t('deleteAccount') })
                : tConfirm('deleteDescription', { name: t('removePin') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tConfirm('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={pending === 'removePin' || pending === 'deleteAccount'}
              onClick={async () => {
                if (confirmAction === 'removePin') {
                  await onRemovePin();
                } else if (confirmAction === 'deleteAccount') {
                  await onDeleteAccount();
                }
                setConfirmAction(null);
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
