import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import type { Metadata, Viewport } from 'next';
import { routing } from '@/i18n/routing';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { PinLockGate } from '@/components/PinLockGate';
import { ConditionalShell } from '@/components/layouts/ConditionalShell';
import type { ReactNode } from 'react';
import '@/styles/globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: 'Budget Manager',
  manifest: '/manifest.json',
  icons: [
    { rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' },
    { rel: 'icon', url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    { rel: 'icon', url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    { rel: 'apple-touch-icon', url: '/apple-touch-icon.png', sizes: '180x180' },
  ],
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
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

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <ServiceWorkerRegistration />
          <PinLockGate />
          <ConditionalShell>{children}</ConditionalShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
