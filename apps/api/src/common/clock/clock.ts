/**
 * The application's "now", behind a port so that a date-dependent answer can be reproduced.
 *
 * Only the reads that matter for what the assistant says go through it: the period resolver, the date
 * in the answer cache key, and the "current" budget, forecast and net worth the tools read. Tokens,
 * sessions, audit timestamps and database defaults keep the real time (`CLOCK_FIXED_AT` is a tool for the
 * evaluation instance, not a way to change what time it is).
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date): Clock {
  // A fresh Date each call: a caller that mutates what it got (`setUTCMonth`) must not move the clock.
  return { now: () => new Date(at.getTime()) };
}

/**
 * An instant with an explicit zone (`2026-09-30T12:00:00Z`, `2026-09-30T12:00:00+01:00`). A bare date
 * is refused: it would silently mean a time of day in some zone, which is the ambiguity this guards.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseFixedInstant(value: string): Date | null {
  if (!ISO_INSTANT.test(value)) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}
