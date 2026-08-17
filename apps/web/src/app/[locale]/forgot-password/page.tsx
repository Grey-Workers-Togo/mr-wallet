'use client';

import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EMAIL_PATTERN } from '@/lib/validation';
import { toast } from '@/hooks/useToast';
import { submitOnCtrlEnter } from '@/lib/form-shortcuts';
import { SubmitShortcutHint } from '@/components/shared/SubmitShortcutHint';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot');
  const tError = useTranslations('error');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post('/auth/password/forgot', { email });
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
    <AuthLayout>
      {done ? (
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MailCheck aria-hidden className="size-6" />
          </div>
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            {t('successTitle')}
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">{t('successBody')}</p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t('backToLogin')}
          </Link>
        </div>
      ) : (
        <>
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

          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t('backToLogin')}
          </Link>
        </>
      )}
    </AuthLayout>
  );
}
