import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localMonthKey, localMonthStart } from '../local-month';

describe('localMonthKey', () => {
  it('keeps the UTC month for a UTC user', () => {
    expect(localMonthKey(new Date('2026-09-30T23:30:00Z'), 'UTC')).toBe('2026-09');
  });

  it('rolls over to the next month for a user ahead of UTC', () => {
    // 23:30 UTC on 30 Sep is 00:30 on 1 Oct in Porto-Novo (UTC+1).
    expect(localMonthKey(new Date('2026-09-30T23:30:00Z'), 'Africa/Porto-Novo')).toBe('2026-10');
  });

  it('stays in the previous month for a user behind UTC', () => {
    // 02:00 UTC on 1 Oct is 22:00 on 30 Sep in New York (UTC-4 in summer time).
    expect(localMonthKey(new Date('2026-10-01T02:00:00Z'), 'America/New_York')).toBe('2026-09');
  });

  it('crosses the year boundary', () => {
    expect(localMonthKey(new Date('2026-12-31T23:30:00Z'), 'Africa/Porto-Novo')).toBe('2027-01');
  });
});

describe('localMonthStart', () => {
  it('is local midnight of the first day, expressed in UTC', () => {
    expect(localMonthStart(new Date('2026-09-15T10:00:00Z'), 'Africa/Porto-Novo', 0).toISOString()).toBe('2026-08-31T23:00:00.000Z');
    expect(localMonthStart(new Date('2026-09-15T10:00:00Z'), 'UTC', 0).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('goes back whole local months, across a year boundary', () => {
    expect(localMonthStart(new Date('2026-02-10T10:00:00Z'), 'UTC', 3).toISOString()).toBe('2025-11-01T00:00:00.000Z');
  });

  it('uses the local month of the instant, not the UTC one', () => {
    // Still 30 Sep in New York, so the month starts on 1 Sep (04:00 UTC).
    expect(localMonthStart(new Date('2026-10-01T02:00:00Z'), 'America/New_York', 0).toISOString()).toBe('2026-09-01T04:00:00.000Z');
  });

  it('follows the offset in force on the first day, not the one of the instant (DST)', () => {
    // 1 Mar is still EST (UTC-5) in New York, while 15 Mar is already EDT.
    expect(localMonthStart(new Date('2026-03-15T10:00:00Z'), 'America/New_York', 0).toISOString()).toBe('2026-03-01T05:00:00.000Z');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(isValidTimeZone('Africa/Porto-Novo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
