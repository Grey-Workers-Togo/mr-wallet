/** ISO calendar date, `YYYY-MM-DD`, already resolved to the user's local timezone. */
export type LocalDate = string;

export interface Streak {
  current: number;
  longest: number;
}

function daysBetween(a: LocalDate, b: LocalDate): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / msPerDay);
}

/**
 * `dates` may contain duplicates/any order; `today` is the caller's current local date.
 * A streak is "alive" only if its most recent day is today or yesterday — skip a day
 * and `current` drops to 0, but `longest` keeps the best run ever recorded.
 */
export function computeStreak(dates: LocalDate[], today: LocalDate): Streak {
  const distinct = [...new Set(dates)].sort();
  if (distinct.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < distinct.length; i++) {
    const day = distinct[i] as LocalDate;
    const prevDay = distinct[i - 1] as LocalDate;
    run = daysBetween(day, prevDay) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const mostRecent = distinct[distinct.length - 1] as LocalDate;
  const gapToToday = daysBetween(today, mostRecent);
  if (gapToToday > 1) return { current: 0, longest };

  let current = 1;
  for (let i = distinct.length - 1; i > 0; i--) {
    const day = distinct[i] as LocalDate;
    const prevDay = distinct[i - 1] as LocalDate;
    if (daysBetween(day, prevDay) !== 1) break;
    current++;
  }
  return { current, longest };
}
