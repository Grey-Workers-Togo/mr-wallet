import { z } from 'zod';

/**
 * ADR-0016 §2: the model never produces a date. It names a period symbolically and the server
 * resolves it to UTC bounds in `users.timezone`, the only place the timezone is applied
 * (docs/02-architecture.md §7). Pure: no Nest, no Prisma.
 */

export const NAMED_PERIODS = ['this_month', 'last_month', 'last_3_months', 'this_year'] as const;

/** `this_month`, `last_month`, `last_3_months`, `this_year`, or an explicit month `YYYY-MM`. */
export const symbolicPeriodSchema = z.union([
  z.enum(NAMED_PERIODS),
  z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/),
]);
export type SymbolicPeriod = z.infer<typeof symbolicPeriodSchema>;

export interface ResolvedPeriod {
  /** First instant of the period, inclusive. */
  from: Date;
  /** First instant after the period: the bound is exclusive. Use `to - 1 ms` against an inclusive (`lte`) filter. */
  to: Date;
  /** First local calendar day, `YYYY-MM-DD`. */
  localFrom: string;
  /** Last local calendar day, inclusive, `YYYY-MM-DD`. */
  localTo: string;
}

export class InvalidTimezoneError extends Error {
  constructor(readonly timeZone: string) {
    super(`Invalid IANA timezone: ${timeZone}`);
    this.name = 'InvalidTimezoneError';
  }
}

interface YearMonth {
  year: number;
  /** 1–12 */
  month: number;
}

function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    throw new InvalidTimezoneError(timeZone);
  }
}

function localFields(formatter: Intl.DateTimeFormat, instantMs: number) {
  const fields: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  return fields as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of the zone from UTC at an instant, in ms (positive east of Greenwich). */
function offsetMs(formatter: Intl.DateTimeFormat, instantMs: number): number {
  const wholeSecond = Math.floor(instantMs / 1000) * 1000;
  const f = localFields(formatter, wholeSecond);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - wholeSecond;
}

/**
 * The UTC instant at which the local wall clock of `timeZone` reads midnight of the first day of
 * `ym`. Two passes settle the offset across a DST transition.
 */
function startOfLocalMonth(formatter: Intl.DateTimeFormat, ym: YearMonth): Date {
  const wallClockAsUtc = Date.UTC(ym.year, ym.month - 1, 1);
  const firstGuess = wallClockAsUtc - offsetMs(formatter, wallClockAsUtc);
  return new Date(wallClockAsUtc - offsetMs(formatter, firstGuess));
}

export function resolvePeriod(period: SymbolicPeriod, context: { now: Date; timeZone: string }): ResolvedPeriod {
  const formatter = formatterFor(context.timeZone);
  const today = localFields(formatter, context.now.getTime());
  const current: YearMonth = { year: today.year, month: today.month };

  let first: YearMonth;
  let afterLast: YearMonth;
  switch (period) {
    case 'this_month':
      first = current;
      afterLast = addMonths(current, 1);
      break;
    case 'last_month':
      first = addMonths(current, -1);
      afterLast = current;
      break;
    case 'last_3_months':
      // Same convention as `ReportingService.monthlySummary({ months: 3 })`: the current month and the two before.
      first = addMonths(current, -2);
      afterLast = addMonths(current, 1);
      break;
    case 'this_year':
      first = { year: current.year, month: 1 };
      afterLast = { year: current.year + 1, month: 1 };
      break;
    default: {
      const [year, month] = period.split('-').map(Number) as [number, number];
      first = { year, month };
      afterLast = addMonths(first, 1);
    }
  }

  const lastDay = addMonths(afterLast, -1);
  const daysInLastMonth = new Date(Date.UTC(lastDay.year, lastDay.month, 0)).getUTCDate();
  return {
    from: startOfLocalMonth(formatter, first),
    to: startOfLocalMonth(formatter, afterLast),
    localFrom: `${pad(first.year, 4)}-${pad(first.month)}-01`,
    localTo: `${pad(lastDay.year, 4)}-${pad(lastDay.month)}-${pad(daysInLastMonth)}`,
  };
}
