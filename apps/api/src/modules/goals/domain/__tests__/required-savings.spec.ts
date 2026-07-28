import { describe, expect, it } from 'vitest';
import { computeRequiredSavings } from '../required-savings';

describe('computeRequiredSavings (RG-G3)', () => {
  it('rounds the required monthly amount up', () => {
    const result = computeRequiredSavings(100_000n, 10_000n, new Date(Date.UTC(2026, 3, 1)), new Date(Date.UTC(2026, 0, 1)));
    // 90000 / 3 = 30000 exactly
    expect(result.monthsRemaining).toBe(3);
    expect(result.requiredMonthlyMinor).toBe(30_000n);
    expect(result.isOverdue).toBe(false);
  });

  it('rounds up on a non-divisible remainder', () => {
    const result = computeRequiredSavings(100_000n, 0n, new Date(Date.UTC(2026, 3, 1)), new Date(Date.UTC(2026, 0, 1)));
    // 100000 / 3 = 33333.33 -> 33334
    expect(result.requiredMonthlyMinor).toBe(33_334n);
  });

  it('flags overdue instead of a negative amount when the target date has passed', () => {
    const result = computeRequiredSavings(100_000n, 10_000n, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 3, 1)));
    expect(result.isOverdue).toBe(true);
    expect(result.requiredMonthlyMinor).toBeNull();
  });

  it('returns null when there is no target date', () => {
    const result = computeRequiredSavings(100_000n, 10_000n, null, new Date(Date.UTC(2026, 0, 1)));
    expect(result.monthsRemaining).toBeNull();
    expect(result.requiredMonthlyMinor).toBeNull();
    expect(result.isOverdue).toBe(false);
  });

  it('already reached: zero required, not overdue', () => {
    const result = computeRequiredSavings(100_000n, 120_000n, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 3, 1)));
    expect(result.requiredMonthlyMinor).toBe(0n);
    expect(result.isOverdue).toBe(false);
  });
});
