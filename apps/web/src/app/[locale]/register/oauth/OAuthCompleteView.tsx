'use client';

import { Suspense, useEffect, useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCurrencies } from '@/hooks/useCurrencies';
import { toast } from '@/hooks/useToast';
import { submitOnCtrlEnter } from '@/lib/form-shortcuts';
import { SubmitShortcutHint } from '@/components/shared/SubmitShortcutHint';

interface OAuthCompleteResponse {
  accessToken: string;
  user: { id: string; email: string };
}

export default function OAuthCompleteView() {
  return (
    <Suspense fallback={null}>
      <OAuthCompleteForm />
    </Suspense>
  );
}

function OAuthCompleteForm() {
  const t = useTranslations('auth.oauthComplete');
  const tError = useTranslations('error');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const currencies = useCurrencies();
  const currencyItems = Object.fromEntries(currencies.map((c) => [c.code, c.code]));

  // Captured once on mount, then stripped from the visible URL — it's a single-use, sensitive token.
  const [token] = useState(() => searchParams.get('token'));

  // Deliberately runs once on mount only, to strip the token from the visible URL.
  useEffect(() => {
    router.replace(pathname);
  }, []);

  const [baseCurrency, setBaseCurrency] = useState('XOF');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.post<OAuthCompleteResponse>('/auth/oauth/complete', { token, baseCurrency });
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

      {!token ? (
        <Alert variant="destructive">
          <AlertDescription>{t('missingToken')}</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} onKeyDown={submitOnCtrlEnter} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="baseCurrency" required>
              {t('baseCurrencyLabel')}
            </Label>
            <Select items={currencyItems} value={baseCurrency} onValueChange={(value) => setBaseCurrency(value ?? '')}>
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
      )}

      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('loginLink')}
        </Link>
      </p>
    </AuthLayout>
  );
}
