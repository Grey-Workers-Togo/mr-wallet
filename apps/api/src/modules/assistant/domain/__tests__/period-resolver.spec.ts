import { describe, expect, it } from 'vitest';
import { InvalidTimezoneError, resolvePeriod, symbolicPeriodSchema } from '../period-resolver';

function iso(period: ReturnType<typeof resolvePeriod>) {
  return { from: period.from.toISOString(), to: period.to.toISOString(), localFrom: period.localFrom, localTo: period.localTo };
}

describe('resolvePeriod (ADR-0016 §2)', () => {
  it('resolves this_month and last_month in UTC', () => {
    const now = new Date('2026-09-15T10:00:00Z');
    expect(iso(resolvePeriod('this_month', { now, timeZone: 'UTC' }))).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
      localFrom: '2026-09-01',
      localTo: '2026-09-30',
    });
    expect(iso(resolvePeriod('last_month', { now, timeZone: 'UTC' }))).toEqual({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      localFrom: '2026-08-01',
      localTo: '2026-08-31',
    });
  });

  it('applies the user timezone to the month boundary, not the server clock', () => {
    // 2026-09-30T23:30Z is already October 1st at 00:30 in Porto-Novo (UTC+1), still September in Lomé (UTC+0).
    const now = new Date('2026-09-30T23:30:00Z');
    expect(iso(resolvePeriod('this_month', { now, timeZone: 'Africa/Porto-Novo' }))).toEqual({
      from: '2026-09-30T23:00:00.000Z',
      to: '2026-10-31T23:00:00.000Z',
      localFrom: '2026-10-01',
      localTo: '2026-10-31',
    });
    expect(iso(resolvePeriod('this_month', { now, timeZone: 'Africa/Lome' }))).toEqual({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
      localFrom: '2026-09-01',
      localTo: '2026-09-30',
    });
  });

  it('keeps the previous local month for a user west of Greenwich just after UTC midnight', () => {
    // 2026-10-01T02:00Z is September 30th 22:00 in New York (EDT, UTC-4).
    const now = new Date('2026-10-01T02:00:00Z');
    expect(iso(resolvePeriod('this_month', { now, timeZone: 'America/New_York' }))).toEqual({
      from: '2026-09-01T04:00:00.000Z',
      to: '2026-10-01T04:00:00.000Z',
      localFrom: '2026-09-01',
      localTo: '2026-09-30',
    });
  });

  it('settles the offset across a DST transition inside the period', () => {
    // New York: EST (UTC-5) on 1 March, EDT (UTC-4) on 1 April. A March period straddles the change.
    const now = new Date('2026-03-20T12:00:00Z');
    expect(iso(resolvePeriod('this_month', { now, timeZone: 'America/New_York' }))).toEqual({
      from: '2026-03-01T05:00:00.000Z',
      to: '2026-04-01T04:00:00.000Z',
      localFrom: '2026-03-01',
      localTo: '2026-03-31',
    });
  });

  it('handles zones far east of Greenwich and a southern-hemisphere DST', () => {
    // Kiritimati is UTC+14: when it is Jan 1st there, it is still Dec 31st in UTC.
    const kiritimati = resolvePeriod('this_month', { now: new Date('2026-12-31T12:00:00Z'), timeZone: 'Pacific/Kiritimati' });
    expect(iso(kiritimati)).toMatchObject({ from: '2026-12-31T10:00:00.000Z', localFrom: '2027-01-01' });
    // Auckland: NZDT (UTC+13) in January, NZST (UTC+12) in July.
    expect(iso(resolvePeriod('this_month', { now: new Date('2026-01-10T00:00:00Z'), timeZone: 'Pacific/Auckland' })).from).toBe(
      '2025-12-31T11:00:00.000Z',
    );
    expect(iso(resolvePeriod('this_month', { now: new Date('2026-07-10T00:00:00Z'), timeZone: 'Pacific/Auckland' })).from).toBe(
      '2026-06-30T12:00:00.000Z',
    );
  });

  it('crosses the year boundary for last_month and last_3_months', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    expect(iso(resolvePeriod('last_month', { now, timeZone: 'UTC' }))).toMatchObject({
      localFrom: '2025-12-01',
      localTo: '2025-12-31',
    });
    // Same convention as monthlySummary({ months: 3 }): current month and the two before it.
    expect(iso(resolvePeriod('last_3_months', { now, timeZone: 'UTC' }))).toEqual({
      from: '2025-11-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      localFrom: '2025-11-01',
      localTo: '2026-01-31',
    });
  });

  it('resolves this_year and an explicit month, including February of a leap year', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    expect(iso(resolvePeriod('this_year', { now, timeZone: 'UTC' }))).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      to: '2027-01-01T00:00:00.000Z',
      localFrom: '2026-01-01',
      localTo: '2026-12-31',
    });
    expect(iso(resolvePeriod('2028-02', { now, timeZone: 'UTC' }))).toMatchObject({ localFrom: '2028-02-01', localTo: '2028-02-29' });
    expect(iso(resolvePeriod('2026-02', { now, timeZone: 'UTC' }))).toMatchObject({ localFrom: '2026-02-01', localTo: '2026-02-28' });
  });

  it('an explicit month is a local month: its UTC bounds follow the timezone', () => {
    const period = resolvePeriod('2026-09', { now: new Date('2026-12-01T00:00:00Z'), timeZone: 'Africa/Porto-Novo' });
    expect(iso(period)).toMatchObject({ from: '2026-08-31T23:00:00.000Z', to: '2026-09-30T23:00:00.000Z' });
  });

  it('is gap-free: consecutive months share their boundary exactly', () => {
    const now = new Date('2026-03-31T23:59:59Z');
    for (const timeZone of ['UTC', 'Africa/Porto-Novo', 'America/New_York', 'Pacific/Auckland']) {
      const previous = resolvePeriod('last_month', { now, timeZone });
      const current = resolvePeriod('this_month', { now, timeZone });
      expect(previous.to.getTime()).toBe(current.from.getTime());
    }
  });

  it('rejects an unknown timezone instead of silently falling back to UTC', () => {
    expect(() => resolvePeriod('this_month', { now: new Date(), timeZone: 'Mars/Olympus' })).toThrow(InvalidTimezoneError);
  });
});

describe('symbolicPeriodSchema', () => {
  it('accepts the named periods and a well-formed month, rejects anything else the model might invent', () => {
    for (const ok of ['this_month', 'last_month', 'last_3_months', 'this_year', '2026-09', '1999-12']) {
      expect(symbolicPeriodSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['2026-13', '2026-00', '2026-9', '2026-09-01', 'yesterday', 'last_week', '', '2026-09T00:00:00Z']) {
      expect(symbolicPeriodSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});
