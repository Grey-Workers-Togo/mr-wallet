'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';
import { Card } from '@/components/ui/card';

const AVATAR_COLORS = ['bg-primary/15 text-primary-dark', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700'];

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
    >
      <Card className="h-full gap-3 p-6 text-left transition-shadow hover:shadow-lg">
        <div className="flex gap-0.5 text-amber-400">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} aria-hidden className="size-4 fill-current" />
          ))}
        </div>
        <p className="text-sm text-neutral-700">&ldquo;{quote}&rdquo;</p>
        <div className="mt-2 flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`}
          >
            {initials}
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-900">{name}</p>
            <p className="text-xs text-neutral-500">{role}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
