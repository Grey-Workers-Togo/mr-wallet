import { describe, expect, it } from 'vitest';
import { computeStreak } from '../streak';

describe('computeStreak', () => {
  it('returns 0/0 with no transactions', () => {
    expect(computeStreak([], '2026-01-10')).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive days ending today', () => {
    const dates = ['2026-01-08', '2026-01-09', '2026-01-10'];
    expect(computeStreak(dates, '2026-01-10')).toEqual({ current: 3, longest: 3 });
  });

  it('stays alive when the most recent entry was yesterday', () => {
    const dates = ['2026-01-08', '2026-01-09'];
    expect(computeStreak(dates, '2026-01-10')).toEqual({ current: 2, longest: 2 });
  });

  it('resets current to 0 after a gap of 2+ days, but keeps longest', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-08'];
    expect(computeStreak(dates, '2026-01-10')).toEqual({ current: 0, longest: 3 });
  });

  it('ignores duplicate/unordered dates', () => {
    const dates = ['2026-01-10', '2026-01-09', '2026-01-09', '2026-01-08'];
    expect(computeStreak(dates, '2026-01-10')).toEqual({ current: 3, longest: 3 });
  });

  it('tracks longest separately from a broken current streak', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-10'];
    expect(computeStreak(dates, '2026-01-10')).toEqual({ current: 1, longest: 5 });
  });
});
