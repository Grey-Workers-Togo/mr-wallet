import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/shared/Logo';
import { routing } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'accountDeletion' });
  return {
    title: t('title'),
    description: t('intro'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${locale}/account-deletion`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/account-deletion`])),
    },
  };
}

export default async function AccountDeletionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'accountDeletion' });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <Link href="/">
        <Logo size={32} />
      </Link>

      <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{t('title')}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">{t('intro')}</p>

      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t('selfServiceTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0 text-neutral-700 dark:text-neutral-300">
          <ol className="list-decimal space-y-1 pl-5">
            <li>{t('selfServiceStep1')}</li>
            <li>{t('selfServiceStep2')}</li>
            <li>{t('selfServiceStep3')}</li>
          </ol>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('selfServiceNote')}</p>
        </CardContent>
      </Card>

      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t('noAccessTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 text-neutral-700 dark:text-neutral-300">
          <p>
            {t('noAccessBody')}{' '}
            <a href="mailto:contact@mister-wallet.com" className="text-primary underline">
              {t('contactLink')}
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
