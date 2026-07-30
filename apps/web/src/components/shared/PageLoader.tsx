import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function PageLoader() {
  const t = useTranslations('common');
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-neutral-500">
      <Loader2 aria-hidden className="size-5 animate-spin" />
      <span className="text-sm">{t('loading')}</span>
    </div>
  );
}
