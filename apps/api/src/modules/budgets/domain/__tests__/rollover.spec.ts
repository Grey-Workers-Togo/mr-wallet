import { describe, expect, it } from 'vitest';
import { cascadeRollover } from '../rollover';

describe('RG-B5: cascadeRollover', () => {
  it('carries what is left, period to period, and what is overspent', () => {
    const periods = [{ spentMinor: 50000n }, { spentMinor: 80000n }, { spentMinor: 0n }];
    expect(cascadeRollover(71000n, true, periods)).toEqual([
      { rolloverInMinor: 0n, allocatedMinor: 71000n },
      { rolloverInMinor: 21000n, allocatedMinor: 92000n },
      { rolloverInMinor: 12000n, allocatedMinor: 83000n },
    ]);
  });

  it('lets the carry go negative', () => {
    expect(cascadeRollover(1000n, true, [{ spentMinor: 4000n }, { spentMinor: 0n }])[1]).toEqual({
      rolloverInMinor: -3000n,
      allocatedMinor: -2000n,
    });
  });

  it('without rollover every period is the base amount', () => {
    expect(cascadeRollover(1000n, false, [{ spentMinor: 4000n }, { spentMinor: 0n }], 500n)).toEqual([
      { rolloverInMinor: 0n, allocatedMinor: 1000n },
      { rolloverInMinor: 0n, allocatedMinor: 1000n },
    ]);
  });

  it('continues from the carry of an earlier period', () => {
    expect(cascadeRollover(1000n, true, [{ spentMinor: 0n }], 250n)).toEqual([{ rolloverInMinor: 250n, allocatedMinor: 1250n }]);
  });
});
