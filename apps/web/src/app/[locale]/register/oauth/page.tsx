import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import OAuthCompleteView from './OAuthCompleteView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.oauthComplete' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default function OAuthCompletePage() {
  return <OAuthCompleteView />;
}
