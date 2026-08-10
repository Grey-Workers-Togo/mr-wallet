'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export function PricingCard({
  name,
  price,
  period,
  features,
  ctaLabel,
  href,
  highlighted,
  badge,
  index,
}: {
  name: string;
  price: string;
  period?: string;
  features: string[];
  ctaLabel: string;
  href: string;
  highlighted?: boolean;
  badge?: string;
  index: number;
}) {
  const reduce = useReducedMotion();
  const isExternal = /^(mailto:|https?:)/.test(href);
  const ctaClassName = cn(
    'mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors',
    highlighted
      ? 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
      : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-white/15 dark:text-neutral-100 dark:hover:bg-white/5',
  );

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="relative h-full"
    >
      {badge ? (
        <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
          {badge}
        </span>
      ) : null}
      <div
        className={cn(
          'flex h-full flex-col gap-5 rounded-2xl border p-6 text-left',
          highlighted
            ? 'border-primary/40 bg-primary/[0.06] shadow-[0_0_60px_-15px_var(--color-primary)]'
            : 'border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none',
        )}
      >
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{name}</h3>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-bold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-50">
              {price}
            </span>
            {period ? <span className="text-sm text-neutral-500">{period}</span> : null}
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
        {isExternal ? (
          <a href={href} className={ctaClassName}>
            {ctaLabel}
          </a>
        ) : (
          <Link href={href} className={ctaClassName}>
            {ctaLabel}
          </Link>
        )}
      </div>
    </motion.div>
  );
}
