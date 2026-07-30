'use client';

import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EMAIL_PATTERN } from '@/lib/validation';
import { toast } from '@/hooks/useToast';

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string };
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tError = useTranslations('error');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-bg-secondary px-4">
      <Card className="w-full max-w-sm p-8 space-y-6">
        <CardHeader className="p-0 space-y-2">
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" required>{t('emailLabel')}</Label>
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
              <Label htmlFor="password" required>{t('passwordLabel')}</Label>
              <Input
                id="password"
                type="password"
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
            <Button type="submit" className="w-full" loading={submitting}>
              {submitting ? t('submitting') : t('submit')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-neutral-600">
            {t('noAccount')}{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              {t('registerLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
