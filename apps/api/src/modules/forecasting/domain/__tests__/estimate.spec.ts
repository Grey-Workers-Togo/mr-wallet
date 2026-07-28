import { describe, expect, it } from 'vitest';
import { estimateMonthlyNonRecurring } from '../estimate';

describe('estimateMonthlyNonRecurring (RG-F3, docs/04 §I)', () => {
  it('returns null with fewer than 2 months of history', () => {
    expect(estimateMonthlyNonRecurring([])).toBeNull();
    expect(estimateMonthlyNonRecurring([1000n])).toBeNull();
  });

  it('averages the last 3 months when stable', () => {
    const result = estimateMonthlyNonRecurring([10_000n, 11_000n, 9_000n, 10_000n]);
    expect(result).toBe(10_000n); // last 3: 11000+9000+10000 = 30000/3
  });

  it('falls back to a 6-month median when variance is high (>40% of the mean)', () => {
    const months = [1_000n, 1_000n, 1_000n, 1_000n, 1_000n, 50_000n]; // one wild outlier month
    const result = estimateMonthlyNonRecurring(months);
    expect(result).toBe(1_000n); // median of the 6, not skewed by the outlier
  });
});
