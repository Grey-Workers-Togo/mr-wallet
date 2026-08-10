'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

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
      transition={{ duration: 0.6, delay: index * 0.12, ease: [0.34, 1.56, 0.64, 1] }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="group h-full"
    >
      <div className="flex h-full flex-col items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition-all group-hover:border-neutral-300 group-hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none dark:group-hover:border-white/20 dark:group-hover:bg-white/[0.05]">
        <motion.div
          whileHover={reduce ? undefined : { scale: 1.08 }}
          transition={{ duration: 0.3 }}
          className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors dark:bg-white/[0.06] dark:text-neutral-200 dark:ring-white/10 dark:group-hover:bg-primary/15 dark:group-hover:text-primary dark:group-hover:ring-primary/25"
        >
          <Icon aria-hidden className="size-5" />
        </motion.div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h3>
        <p className="text-[0.95rem] leading-relaxed text-neutral-600 dark:text-neutral-400">{description}</p>
      </div>
    </motion.div>
  );
}
