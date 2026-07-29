/** RG-G3: monthly savings required to hit the target on time, rounded up. `null` when there's no target date. */
export function monthsRemaining(targetDate: Date | null, now: Date): number | null {
  if (!targetDate) return null;
  const months =
    (targetDate.getUTCFullYear() - now.getUTCFullYear()) * 12 + (targetDate.getUTCMonth() - now.getUTCMonth());
  return months;
}

export interface RequiredSavings {
  monthsRemaining: number | null;
  requiredMonthlyMinor: bigint | null;
  isOverdue: boolean;
}

export function computeRequiredSavings(targetMinor: bigint, currentMinor: bigint, targetDate: Date | null, now: Date): RequiredSavings {
  const remainingMinor = targetMinor - currentMinor;
  if (remainingMinor <= 0n) {
    return { monthsRemaining: 0, requiredMonthlyMinor: 0n, isOverdue: false };
  }

  const months = monthsRemaining(targetDate, now);
  if (months === null) {
    return { monthsRemaining: null, requiredMonthlyMinor: null, isOverdue: false };
  }
  if (months <= 0) {
    // RG-G3: past the target date and not reached — surface the delay, never a negative amount.
    return { monthsRemaining: months, requiredMonthlyMinor: null, isOverdue: true };
  }

  const requiredMonthlyMinor = (remainingMinor + BigInt(months) - 1n) / BigInt(months); // ceil
  return { monthsRemaining: months, requiredMonthlyMinor, isOverdue: false };
}
