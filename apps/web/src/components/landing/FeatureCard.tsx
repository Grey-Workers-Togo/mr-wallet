'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const ICON_STYLES = [
  'bg-primary/10 text-primary',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-orange-100 text-orange-700',
];

export function FeatureCard({
  icon: Icon,
  title,
  description,
  index,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  index: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.6, delay: Math.min(index, 5) * 0.1, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="group"
    >
      <Card className="h-full items-start gap-3 p-6 text-left transition-shadow group-hover:shadow-lg">
        <motion.div
          whileHover={reduce ? undefined : { scale: 1.1, rotate: 6 }}
          transition={{ duration: 0.3 }}
          className={`flex size-10 items-center justify-center rounded-lg ${ICON_STYLES[index % ICON_STYLES.length]}`}
        >
          <Icon aria-hidden className="size-5" />
        </motion.div>
        <CardHeader className="w-full px-0 text-left">
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="w-full px-0">
          <CardDescription className="text-base text-neutral-600">{description}</CardDescription>
        </CardContent>
      </Card>
    </motion.div>
  );
}
