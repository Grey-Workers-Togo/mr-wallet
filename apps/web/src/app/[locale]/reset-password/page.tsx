'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PASSWORD_MIN_LENGTH } from '@/lib/validation';
import { toast } from '@/hooks/useToast';
import { submitOnCtrlEnter } from '@/lib/form-shortcuts';
import { SubmitShortcutHint } from '@/components/shared/SubmitShortcutHint';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const tError = useTranslations('error');
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('PASSWORDS_DO_NOT_MATCH');
      toast({ title: tError('PASSWORDS_DO_NOT_MATCH'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/auth/password/reset', { token, newPassword });
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tError(code as never), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-secondary px-4">
      <Card className="w-full max-w-sm p-8 space-y-6">
        <CardHeader className="p-0 space-y-2">
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {done ? (
            <>
              <Alert>
                <AlertDescription>{t('successMessage')}</AlertDescription>
              </Alert>
              <p className="mt-4 text-center text-sm text-neutral-600 dark:text-neutral-400">
                <Link href="/login" className="font-medium text-primary hover:underline">
                  {t('loginLink')}
                </Link>
              </p>
            </>
          ) : !token ? (
            <Alert variant="destructive">
              <AlertDescription>{t('missingToken')}</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={onSubmit} onKeyDown={submitOnCtrlEnter} className="space-y-4">
              <div>
                <Label htmlFor="newPassword" required>{t('newPasswordLabel')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword" required>{t('confirmPasswordLabel')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{tError(error as never)}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" loading={submitting}>
                {submitting ? t('submitting') : t('submit')}
              </Button>
              <SubmitShortcutHint />
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
