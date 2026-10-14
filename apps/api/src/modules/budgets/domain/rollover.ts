/**
 * RG-B5: with `rollover`, `allocated(n) = amount + (allocated(n-1) − spent(n-1))`. The carry can be
 * negative: overspending is carried forward. The first period has no carry.
 *
 * Pure, over the periods in chronological order. `carryIn` is the carry out of a period that comes
 * before the first one given (an already-materialized last period when the horizon is extended).
 */
export interface RolloverPeriod {
  spentMinor: bigint;
}

export interface RolloverAllocation {
  rolloverInMinor: bigint;
  allocatedMinor: bigint;
}

export function cascadeRollover(
  amountMinor: bigint,
  rollover: boolean,
  periods: readonly RolloverPeriod[],
  carryIn: bigint = 0n,
): RolloverAllocation[] {
  let carry = rollover ? carryIn : 0n;
  return periods.map((period) => {
    const allocation = { rolloverInMinor: carry, allocatedMinor: amountMinor + carry };
    carry = rollover ? allocation.allocatedMinor - period.spentMinor : 0n;
    return allocation;
  });
}
