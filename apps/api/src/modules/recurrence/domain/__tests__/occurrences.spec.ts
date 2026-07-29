import { describe, expect, it } from 'vitest';
import { computeOccurrences } from '../occurrences';

describe('computeOccurrences', () => {
  it('advances monthly and clamps day 31 to the last day of shorter months (RG-R2)', () => {
    const occurrences = computeOccurrences(
      {
        startsOn: new Date(Date.UTC(2026, 0, 31)),
        endsOn: null,
        frequency: 'MONTHLY',
        interval: 1,
        dayOfMonth: 31,
        maxOccurrences: 4,
      },
      new Date(Date.UTC(2026, 11, 31)),
    );

    expect(occurrences).toHaveLength(4);
    expect(occurrences[0]?.getUTCDate()).toBe(31);
    expect(occurrences[1]?.getUTCMonth()).toBe(1);
    expect(occurrences[1]?.getUTCDate()).toBe(28); // February 2026 has 28 days — never rolls to March.
    expect(occurrences[2]?.getUTCMonth()).toBe(2);
    expect(occurrences[2]?.getUTCDate()).toBe(31);
  });

  it('stops at endsOn', () => {
    const occurrences = computeOccurrences(
      {
        startsOn: new Date(Date.UTC(2026, 0, 1)),
        endsOn: new Date(Date.UTC(2026, 0, 20)),
        frequency: 'WEEKLY',
        interval: 1,
        dayOfMonth: null,
        maxOccurrences: null,
      },
      new Date(Date.UTC(2026, 2, 1)),
    );
    expect(occurrences).toHaveLength(3);
  });

  it('respects maxOccurrences', () => {
    const occurrences = computeOccurrences(
      {
        startsOn: new Date(Date.UTC(2026, 0, 1)),
        endsOn: null,
        frequency: 'DAILY',
        interval: 1,
        dayOfMonth: null,
        maxOccurrences: 5,
      },
      new Date(Date.UTC(2026, 5, 1)),
    );
    expect(occurrences).toHaveLength(5);
  });
});
