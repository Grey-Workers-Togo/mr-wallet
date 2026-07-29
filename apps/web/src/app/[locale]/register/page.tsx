'use client';

import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCurrencies } from '@/hooks/useCurrencies';
import { EMAIL_PATTERN, PASSWORD_MIN_LENGTH } from '@/lib/validation';

interface RegisterResponse {
  accessToken: string;
  user: { id: string; email: string };
}

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const tError = useTranslations('error');
  const router = useRouter();
  const currencies = useCurrencies();
  const currencyItems = Object.fromEntries(currencies.map((c) => [c.code, c.code]));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('XOF');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setAccessToken(result.accessToken);
      router.push('/accounts');
    } catch (err) {
      setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
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
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input
                id="email"
                type="email"
                pattern={EMAIL_PATTERN}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={PASSWORD_MIN_LENGTH}
                required
              />
            </div>
            <div>
              <Label htmlFor="baseCurrency">{t('baseCurrencyLabel')}</Label>
              <Select items={currencyItems} value={baseCurrency} onValueChange={(value) => setBaseCurrency(value ?? '')}>
                <SelectTrigger id="baseCurrency" className="w-full">
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-neutral-600">
            {t('alreadyHaveAccount')}{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              {t('loginLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
