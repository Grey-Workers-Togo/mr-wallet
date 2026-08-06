'use client';

import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface VerifyResponse {
  accessToken: string;
  user: { id: string; email: string };
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const t = useTranslations('auth.verifyEmail');
  const tError = useTranslations('error');
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const router = useRouter();
  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    let cancelled = false;
    apiClient
      .post<VerifyResponse>('/auth/email/verify', { token })
      .then((result) => {
        if (cancelled) return;
        setAccessToken(result.accessToken);
        setState('success');
        setTimeout(() => router.push('/accounts'), 1500);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.body.code : 'INTERNAL_ERROR');
        setState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-secondary px-4">
      <Card className="w-full max-w-sm p-8 space-y-6">
        <CardHeader className="p-0 space-y-2">
          <CardTitle>{state === 'success' ? t('successTitle') : t('title')}</CardTitle>
          <CardDescription>
            {state === 'verifying' && t('verifying')}
            {state === 'success' && t('successMessage')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {state === 'error' && (
            <>
              <Alert variant="destructive">
                <AlertDescription>{error ? tError(error as never) : t('missingToken')}</AlertDescription>
              </Alert>
              <p className="mt-4 text-center text-sm text-neutral-600">
                <Link href="/login" className="font-medium text-primary hover:underline">
                  {t('loginLink')}
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
