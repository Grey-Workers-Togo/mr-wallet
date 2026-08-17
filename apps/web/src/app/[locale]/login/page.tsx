'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { useAuthSession } from '@/hooks/useAuthSession';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EMAIL_PATTERN } from '@/lib/validation';
import { toast } from '@/hooks/useToast';
import { submitOnCtrlEnter } from '@/lib/form-shortcuts';
import { SubmitShortcutHint } from '@/components/shared/SubmitShortcutHint';

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string };
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tError = useTranslations('error');
  const router = useRouter();
  const session = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session === 'authenticated') {
      router.replace('/accounts');
    }
  }, [session, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.post<LoginResponse>('/auth/login', { email, password });
      setAccessToken(result.accessToken);
      router.push('/accounts');
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tError(code as never), variant: 'destructive' });
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">{t('title')}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">{t('subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} onKeyDown={submitOnCtrlEnter} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" required>
            {t('emailLabel')}
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="h-11"
            pattern={EMAIL_PATTERN}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password" required>
              {t('passwordLabel')}
            </Label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              {t('forgotPassword')}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{tError(error as never)}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" className="h-11 w-full" loading={submitting}>
          {submitting ? t('submitting') : t('submit')}
        </Button>
        <SubmitShortcutHint />
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t('registerLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
