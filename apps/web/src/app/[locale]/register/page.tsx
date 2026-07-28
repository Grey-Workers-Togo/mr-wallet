'use client';

import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';

interface RegisterResponse {
  accessToken: string;
  user: { id: string; email: string };
}

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const tError = useTranslations('error');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
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
    <main>
      <h1>{t('title')}</h1>
      <form onSubmit={onSubmit}>
        <label>
          {t('emailLabel')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          {t('passwordLabel')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={12}
            required
          />
        </label>
        <label>
          {t('baseCurrencyLabel')}
          <input
            type="text"
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            minLength={3}
            required
          />
        </label>
        {error && <p role="alert">{tError(error as never)}</p>}
        <button type="submit" disabled={submitting}>
          {t('submit')}
        </button>
      </form>
    </main>
  );
}
