type Frequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'YEARLY';

const MONTHS_PER_PERIOD: Partial<Record<Frequency, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

/** Number of payments per calendar year for a given frequency. */
export function periodsPerYear(frequency: Frequency): number {
  switch (frequency) {
    case 'DAILY':
      return 365;
    case 'WEEKLY':
      return 52;
    case 'BIWEEKLY':
      return 26;
    case 'MONTHLY':
      return 12;
    case 'QUARTERLY':
      return 4;
    case 'SEMIANNUAL':
      return 2;
    case 'YEARLY':
      return 1;
  }
}

/** `termMonths` is always expressed in months regardless of payment frequency (docs/04 §G). */
export function installmentCount(termMonths: number, frequency: Frequency): number {
  return Math.max(1, Math.round((termMonths * periodsPerYear(frequency)) / 12));
}

/** UTC date arithmetic with day-of-month clamping, consistent with budgets/domain/period-bounds.ts. */
export function addPeriodUTC(from: Date, frequency: Frequency, count: number): Date {
  const monthsPerPeriod = MONTHS_PER_PERIOD[frequency];
  if (monthsPerPeriod) {
    const day = from.getUTCDate();
    const totalMonths = from.getUTCMonth() + monthsPerPeriod * count;
    const year = from.getUTCFullYear() + Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, daysInMonth)));
  }
  const daysPerPeriod = frequency === 'DAILY' ? 1 : frequency === 'WEEKLY' ? 7 : 14;
  return new Date(from.getTime() + daysPerPeriod * count * 24 * 60 * 60 * 1000);
}
