/** RG-R1/RG-R2: occurrence dates are computed on UTC calendar days (transactions store `occurredAt` as timestamptz UTC calendar dates). */

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'YEARLY';

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function addMonths(date: Date, months: number, dayOfMonth?: number | null): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const targetIndex = month + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const day = dayOfMonth ?? date.getUTCDate();
  // RG-R2: day 31 (or any day beyond the target month's length) clamps to the last day of that month — never rolls to the next month.
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return new Date(
    Date.UTC(targetYear, targetMonth, clampedDay, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()),
  );
}

export function addFrequency(date: Date, frequency: RecurrenceFrequency, interval: number, dayOfMonth?: number | null): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'DAILY':
      d.setUTCDate(d.getUTCDate() + interval);
      return d;
    case 'WEEKLY':
      d.setUTCDate(d.getUTCDate() + 7 * interval);
      return d;
    case 'BIWEEKLY':
      d.setUTCDate(d.getUTCDate() + 14 * interval);
      return d;
    case 'MONTHLY':
      return addMonths(d, interval, dayOfMonth);
    case 'QUARTERLY':
      return addMonths(d, interval * 3, dayOfMonth);
    case 'SEMIANNUAL':
      return addMonths(d, interval * 6, dayOfMonth);
    case 'YEARLY':
      return addMonths(d, interval * 12, dayOfMonth);
  }
}

export interface OccurrenceRule {
  startsOn: Date;
  endsOn: Date | null;
  frequency: RecurrenceFrequency;
  interval: number;
  dayOfMonth: number | null;
  maxOccurrences: number | null;
}

/** Generates occurrence dates from `startsOn` (inclusive) up to `until` (inclusive), bounded by `endsOn`/`maxOccurrences`. */
export function computeOccurrences(rule: OccurrenceRule, until: Date): Date[] {
  const occurrences: Date[] = [];
  let current = rule.startsOn;
  let count = 0;
  while (current.getTime() <= until.getTime()) {
    if (rule.endsOn && current.getTime() > rule.endsOn.getTime()) break;
    if (rule.maxOccurrences && count >= rule.maxOccurrences) break;
    occurrences.push(current);
    count += 1;
    current = addFrequency(current, rule.frequency, rule.interval, rule.dayOfMonth);
  }
  return occurrences;
}
