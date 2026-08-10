'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';

export function TestimonialCard({
  name,
  role,
  quote,
  index,
}: {
  name: string;
  role: string;
  quote: string;
  index: number;
}) {
  const reduce = useReducedMotion();
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="group h-full"
    >
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition-all group-hover:border-neutral-300 group-hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none dark:group-hover:border-white/20 dark:group-hover:bg-white/[0.05]">
        <div className="flex gap-0.5 text-amber-400">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} aria-hidden className="size-4 fill-current" />
          ))}
        </div>
        <p className="text-[0.95rem] leading-relaxed text-neutral-700 dark:text-neutral-300">&ldquo;{quote}&rdquo;</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-700 dark:bg-white/10 dark:text-neutral-100">
            {initials}
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{name}</p>
            <p className="text-xs text-neutral-500">{role}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
