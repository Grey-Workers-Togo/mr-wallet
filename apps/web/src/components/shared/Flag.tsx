import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Inline SVG flags — render as real flags on every platform (Windows does not draw emoji flags). */
export function Flag({ locale, className }: { locale: string; className?: string }) {
  const wrap = cn('inline-block overflow-hidden rounded-[3px] ring-1 ring-black/10', className);

  if (locale === 'fr') {
    return (
      <span className={wrap}>
        <svg viewBox="0 0 3 2" preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
          <rect width="3" height="2" fill="#fff" />
          <rect width="1" height="2" fill="#0055A4" />
          <rect x="2" width="1" height="2" fill="#EF4135" />
        </svg>
      </span>
    );
  }

  return <UnionJack className={wrap} />;
}

function UnionJack({ className }: { className?: string }) {
  const id = useId();
  const s = `${id}-s`;
  const t = `${id}-t`;
  return (
    <span className={className}>
      <svg viewBox="0 0 60 30" preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
        <clipPath id={s}>
          <path d="M0,0 v30 h60 v-30 z" />
        </clipPath>
        <clipPath id={t}>
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <g clipPath={`url(#${s})`}>
          <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
          <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${t})`} stroke="#C8102E" strokeWidth="4" />
          <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
          <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
        </g>
      </svg>
    </span>
  );
}
