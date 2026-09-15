'use client';

import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { PageLoader } from '@/components/shared/PageLoader';

interface OAuthLoginExchangeResponse {
  accessToken: string;
  user: { id: string; email: string };
}

export default function OAuthLoginView() {
  return (
    <Suspense fallback={null}>
      <OAuthLoginExchange />
    </Suspense>
  );
}

function OAuthLoginExchange() {
  const t = useTranslations('auth.oauthLogin');
  const searchParams = useSearchParams();
  const router = useRouter();

  // Captured once on mount — it's a single-use token, no reason to re-read it on re-render.
  const [ticket] = useState(() => searchParams.get('ticket'));

  // Deliberately runs once on mount only: exchange the ticket, then move on.
  useEffect(() => {
    if (!ticket) {
      router.replace('/login?error=OAUTH_FAILED');
      return;
    }
    apiClient
      .post<OAuthLoginExchangeResponse>('/auth/oauth/login-complete', { ticket })
      .then((result) => {
        setAccessToken(result.accessToken);
        router.replace('/accounts');
      })
      .catch((err) => {
        const code = err instanceof ApiError ? err.body.code : 'OAUTH_FAILED';
        router.replace(`/login?error=${code}`);
      });
  }, []);

  return (
    <AuthLayout>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">{t('title')}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">{t('subtitle')}</p>
      </div>
      <PageLoader />
    </AuthLayout>
  );
}
