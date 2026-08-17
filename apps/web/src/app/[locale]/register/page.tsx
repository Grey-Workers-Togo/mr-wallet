import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import RegisterView from './RegisterView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.register' });
  return {
    title: t('title'),
    description: t('subtitle'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${locale}/register`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/register`])),
    },
  };
}

export default function RegisterPage() {
  return <RegisterView />;
}
