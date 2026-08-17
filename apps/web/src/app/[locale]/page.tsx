import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import HomeView from './HomeView';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mister-wallet.com';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const appName = t('hero.title');
  const title = t('seo.title');
  const description = t('seo.description');

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: appName,
    keywords: ['budget', 'finances personnelles', 'dépenses', 'épargne', 'personal finance', 'expense tracker'],
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      type: 'website',
      url: `/${locale}`,
      siteName: appName,
      title,
      description,
      locale,
      images: [{ url: '/icon-512x512.png', width: 512, height: 512, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/icon-512x512.png'],
    },
    robots: { index: true, follow: true },
  };
}

export default function HomePage() {
  return <HomeView />;
}
