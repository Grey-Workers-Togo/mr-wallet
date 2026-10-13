import { z } from 'zod';

/**
 * An IANA timezone name (`Africa/Porto-Novo`, `UTC`). Offsets (`+01:00`) are refused: they carry no
 * daylight-saving rules, and period boundaries (docs/02-architecture.md §7) depend on them.
 */
export function ianaTimeZone() {
  return z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    });
}
