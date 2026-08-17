'use client';

import { motion } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';

type EmptyStateCta = { label: string } & ({ onClick: () => void } | { href: string });

interface EmptyStateProps {
  title: string;
  description: string;
  cta?: EmptyStateCta;
  /** Stable hook for the guided tour to target this CTA (e.g. "onboarding-cta"). */
  dataTour?: string;
  /** Skip the Card wrapper for use inside a panel that already provides one. */
  bare?: boolean;
}

export function EmptyState({ title, description, cta, dataTour, bare = false }: EmptyStateProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{title}</h2>
      <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      {cta && (
        <div className="mt-2" data-tour={dataTour}>
          {'href' in cta ? (
            <Link href={cta.href} className={buttonVariants({ variant: 'default' })}>
              {cta.label}
            </Link>
          ) : (
            <Button onClick={cta.onClick}>{cta.label}</Button>
          )}
        </div>
      )}
    </div>
  );

  if (bare) {
    return content;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
      <Card className="p-0">{content}</Card>
    </motion.div>
  );
}
