'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
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
  const ctaClassName = cn(buttonVariants({ variant: highlighted ? 'default' : 'outline', size: 'lg' }), 'mt-2 w-full');

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
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white shadow-md">{badge}</Badge>
      ) : null}
      <Card
        className={cn(
          'h-full gap-4 p-6 text-left',
          highlighted ? 'ring-2 ring-primary shadow-xl' : 'ring-1 ring-border',
        )}
      >
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">{name}</h3>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-neutral-900">{price}</span>
            {period ? <span className="text-sm text-neutral-500">{period}</span> : null}
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-neutral-700">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-500" />
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
      </Card>
    </motion.div>
  );
}
