import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import LoginView from './LoginView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.login' });
  return {
    title: t('title'),
    description: t('subtitle'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${locale}/login`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/login`])),
    },
  };
}

export default function LoginPage() {
  return <LoginView />;
}
