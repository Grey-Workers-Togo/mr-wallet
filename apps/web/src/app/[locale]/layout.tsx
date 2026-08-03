import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Rubik } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { routing } from '@/i18n/routing';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { InstallPrompt } from '@/components/InstallPrompt';
import { PinLockGate } from '@/components/PinLockGate';
import { ConditionalShell } from '@/components/layouts/ConditionalShell';
import { Toaster } from '@/components/shared/Toaster';
import type { ReactNode } from 'react';
import '@/styles/globals.css';

const rubik = Rubik({ subsets: ['latin'], variable: '--font-rubik', display: 'swap' });

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mister-wallet.com';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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
    title: { default: title, template: `%s · ${appName}` },
    description,
    applicationName: appName,
    manifest: '/manifest.json',
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
    icons: [
      { rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'icon', url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { rel: 'icon', url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { rel: 'apple-touch-icon', url: '/apple-touch-icon.png', sizes: '180x180' },
    ],
  };
}

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'home' });
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('hero.title'),
    description: t('hero.description'),
    url: `${SITE_URL}/${locale}`,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };

  return (
    <html lang={locale} className={rubik.variable}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <NextIntlClientProvider>
          <ServiceWorkerRegistration />
          <InstallPrompt />
          <PinLockGate />
          <ConditionalShell>{children}</ConditionalShell>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
