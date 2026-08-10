'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

export function TimelineStep({
  step,
  title,
  description,
  isLast,
}: {
  step: number;
  title: string;
  description: string;
  isLast: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? step : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const duration = 2000;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setCount(Math.round(progress * step));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, step]);

  return (
    <div ref={ref} className="relative flex flex-1 flex-col items-center gap-3 text-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.6 }}
        animate={!reduce && inView ? { opacity: 1, scale: 1 } : undefined}
        transition={{ duration: 0.4 }}
        className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground ring-4 ring-primary/15"
      >
        {count}
      </motion.div>
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-5 left-1/2 hidden h-px w-full bg-neutral-200 md:block dark:bg-white/10"
        />
      )}
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{title}</h3>
      <p className="text-[0.95rem] leading-relaxed text-neutral-600 dark:text-neutral-400">{description}</p>
    </div>
  );
}
