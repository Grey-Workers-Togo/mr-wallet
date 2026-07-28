import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-secondary px-4 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
        <p className="text-base text-neutral-600">{t('subtitle')}</p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/login">{t('login')}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/register">{t('register')}</Link>
        </Button>
      </div>
    </main>
  );
}
