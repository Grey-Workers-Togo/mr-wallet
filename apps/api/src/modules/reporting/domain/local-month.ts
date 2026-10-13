/**
 * Calendar months in a user's timezone. Reports bucket by the user's local month, not the UTC one:
 * a transaction at 00:30 on the 1st (Porto-Novo) belongs to the new month, whatever UTC says.
 */

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === '') return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function localParts(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

/** `YYYY-MM` of an instant in a timezone. */
export function localMonthKey(at: Date, timeZone: string): string {
  const { year, month } = localParts(at, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** Offset of the timezone from UTC at an instant, in milliseconds (east is positive). */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The UTC instant of local midnight on the 1st of the month `monthsBack` months before the local
 * month of `at`. The offset is taken at the target midnight (two passes), so DST is honoured.
 */
export function localMonthStart(at: Date, timeZone: string, monthsBack: number): Date {
  const { year, month } = localParts(at, timeZone);
  const wallClock = Date.UTC(year, month - 1 - monthsBack, 1);
  const firstGuess = wallClock - offsetMs(new Date(wallClock), timeZone);
  return new Date(wallClock - offsetMs(new Date(firstGuess), timeZone));
}
