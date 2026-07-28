export class DateParseError extends Error {}

/** Supports the three common bank-statement date formats — no external date library needed. */
export function parseDateWithFormat(raw: string, dateFormat: string): Date {
  const trimmed = raw.trim();

  let match: RegExpMatchArray | null = null;
  let day: number;
  let month: number;
  let year: number;

  switch (dateFormat) {
    case 'yyyy-MM-dd':
      match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) throw new DateParseError('UNPARSEABLE_DATE');
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
      break;
    case 'dd/MM/yyyy':
      match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) throw new DateParseError('UNPARSEABLE_DATE');
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
      break;
    case 'MM/dd/yyyy':
      match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) throw new DateParseError('UNPARSEABLE_DATE');
      month = Number(match[1]);
      day = Number(match[2]);
      year = Number(match[3]);
      break;
    default:
      throw new DateParseError('UNSUPPORTED_DATE_FORMAT');
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new DateParseError('UNPARSEABLE_DATE');
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new DateParseError('UNPARSEABLE_DATE');
  }
  return date;
}

/**
 * docs/06 §3: dd/MM/yyyy vs MM/dd/yyyy is ambiguous whenever every sampled day value is ≤ 12 —
 * never guess in that case, ask the user (RG documented, not corrected silently).
 */
export function isDayMonthAmbiguous(sampleValues: string[]): boolean {
  const days: number[] = [];
  for (const value of sampleValues) {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/\d{4}$/);
    if (!match) return false;
    days.push(Number(match[1]));
  }
  return days.length > 0 && days.every((d) => d <= 12);
}
