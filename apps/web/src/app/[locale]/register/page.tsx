'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuthSession } from '@/hooks/useAuthSession';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordStrength } from '@/components/shared/PasswordStrength';
import { useCurrencies } from '@/hooks/useCurrencies';
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@/lib/validation';
import { toast } from '@/hooks/useToast';
import { submitOnCtrlEnter } from '@/lib/form-shortcuts';
import { SubmitShortcutHint } from '@/components/shared/SubmitShortcutHint';

interface RegisterResponse {
  email: string;
}

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const tError = useTranslations('error');
  const router = useRouter();
  const session = useAuthSession();
  const currencies = useCurrencies();
  const currencyItems = Object.fromEntries(currencies.map((c) => [c.code, c.code]));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('XOF');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

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
      const result = await apiClient.post<RegisterResponse>('/auth/register', {
        email,
        password,
        baseCurrency,
      });
      setRegisteredEmail(result.email);
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      setError(code);
      toast({ title: tError(code as never), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!registeredEmail) return;
    setResending(true);
    try {
      await apiClient.post('/auth/email/resend', { email: registeredEmail });
      toast({ title: t('resendSuccess'), variant: 'success' });
    } catch (err) {
      const code = err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR';
      toast({ title: tError(code as never), variant: 'destructive' });
    } finally {
      setResending(false);
    }
  }

  if (registeredEmail) {
    return (
      <AuthLayout>
        <div className="mb-2">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            {t('checkEmailTitle')}
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            {t('checkEmailMessage', { email: registeredEmail })}
          </p>
        </div>
        <Button variant="secondary" className="mt-6 h-11 w-full" loading={resending} onClick={onResend}>
          {resending ? t('resendSubmitting') : t('resendButton')}
        </Button>
        <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t('loginLink')}
          </Link>
        </p>
      </AuthLayout>
    );
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
          <Label htmlFor="password" required>
            {t('passwordLabel')}
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="h-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
          <PasswordStrength password={password} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="baseCurrency" required>
            {t('baseCurrencyLabel')}
          </Label>
          <Select
            items={currencyItems}
            value={baseCurrency}
            onValueChange={(value) => setBaseCurrency(value ?? '')}
          >
            <SelectTrigger id="baseCurrency" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        {t('alreadyHaveAccount')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('loginLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
