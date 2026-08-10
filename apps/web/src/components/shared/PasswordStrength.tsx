'use client';

import { useTranslations } from 'next-intl';
import { PASSWORD_MIN_LENGTH } from '@/lib/validation';
import { cn } from '@/lib/utils';

/** 0 = empty, 1 = weak, 2 = fair, 3 = good, 4 = strong. */
function scorePassword(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  // Cap: a password shorter than the minimum can never rate above "weak".
  if (password.length < PASSWORD_MIN_LENGTH) return 1;
  return Math.min(score, 4);
}

const LEVELS = [
  { key: 'weak', bar: 'bg-red-500', text: 'text-red-500' },
  { key: 'fair', bar: 'bg-amber-500', text: 'text-amber-500' },
  { key: 'good', bar: 'bg-lime-500', text: 'text-lime-600 dark:text-lime-400' },
  { key: 'strong', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
] as const;

export function PasswordStrength({ password }: { password: string }) {
  const t = useTranslations('auth.register.passwordStrength');
  const score = scorePassword(password);

  if (!password) return null;

  const level = LEVELS[Math.max(0, score - 1)] ?? LEVELS[0];

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5">
        {LEVELS.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i < score ? level.bar : 'bg-neutral-200 dark:bg-white/10',
            )}
          />
        ))}
      </div>
      <p className={cn('mt-1.5 text-xs font-medium', level.text)}>
        {t('label')} · {t(level.key)}
      </p>
    </div>
  );
}
