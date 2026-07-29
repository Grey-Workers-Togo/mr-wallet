'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
      transition={{ duration: 0.6, delay: index * 0.2, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="group"
    >
      <Card className="h-full items-center gap-3 p-6 text-center transition-shadow group-hover:shadow-lg">
        <motion.div
          whileHover={reduce ? undefined : { scale: 1.1, rotate: 6 }}
          transition={{ duration: 0.3 }}
          className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <Icon aria-hidden className="size-6" />
        </motion.div>
        <CardHeader className="w-full px-0 text-center">
          <CardTitle className="text-lg font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="w-full px-0">
          <CardDescription className="text-base text-neutral-600">{description}</CardDescription>
        </CardContent>
      </Card>
    </motion.div>
  );
}
