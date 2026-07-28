/** RG-B1: period bounds are computed on UTC calendar days, honoring `user.monthStartDay` for monthly budgets. */

export type BudgetPeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Monthly period bounds anchored on `monthStartDay` (e.g. 25 → periods run 25th to 24th). */
export function monthlyPeriodStart(reference: Date, monthStartDay: number): Date {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const anchorDay = Math.min(monthStartDay, daysInMonth(year, month));
  const thisMonthAnchor = new Date(Date.UTC(year, month, anchorDay));
  if (reference.getTime() >= thisMonthAnchor.getTime()) {
    return thisMonthAnchor;
  }
  const prevMonthIndex = month - 1;
  const prevYear = prevMonthIndex < 0 ? year - 1 : year;
  const normalizedPrevMonth = ((prevMonthIndex % 12) + 12) % 12;
  const prevAnchorDay = Math.min(monthStartDay, daysInMonth(prevYear, normalizedPrevMonth));
  return new Date(Date.UTC(prevYear, normalizedPrevMonth, prevAnchorDay));
}

function weeklyPeriodStart(reference: Date): Date {
  const day = reference.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  const start = new Date(reference);
  start.setUTCDate(start.getUTCDate() - diffToMonday);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
}

function quarterlyPeriodStart(reference: Date): Date {
  const quarterMonth = Math.floor(reference.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(reference.getUTCFullYear(), quarterMonth, 1));
}

function yearlyPeriodStart(reference: Date): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), 0, 1));
}

export function periodStart(periodType: BudgetPeriodType, reference: Date, monthStartDay: number): Date {
  switch (periodType) {
    case 'WEEKLY':
      return weeklyPeriodStart(reference);
    case 'MONTHLY':
    case 'CUSTOM':
      return monthlyPeriodStart(reference, monthStartDay);
    case 'QUARTERLY':
      return quarterlyPeriodStart(reference);
    case 'YEARLY':
      return yearlyPeriodStart(reference);
  }
}

/** Exclusive end: the start of the following period. */
export function nextPeriodStart(periodType: BudgetPeriodType, start: Date, monthStartDay: number): Date {
  switch (periodType) {
    case 'WEEKLY': {
      const next = new Date(start);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case 'MONTHLY':
    case 'CUSTOM': {
      const nextMonthIndex = start.getUTCMonth() + 1;
      const nextYear = start.getUTCFullYear() + Math.floor(nextMonthIndex / 12);
      const normalizedMonth = ((nextMonthIndex % 12) + 12) % 12;
      const anchorDay = Math.min(monthStartDay, daysInMonth(nextYear, normalizedMonth));
      return new Date(Date.UTC(nextYear, normalizedMonth, anchorDay));
    }
    case 'QUARTERLY': {
      const month = start.getUTCMonth();
      const year = start.getUTCFullYear();
      const nextMonth = month + 3;
      return new Date(Date.UTC(year + Math.floor(nextMonth / 12), nextMonth % 12, 1));
    }
    case 'YEARLY':
      return new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
  }
}
