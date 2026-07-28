/**
 * docs/04 §I: estimated non-recurring monthly expense — mean of the last 3 full months, or the
 * 6-month median when the standard deviation exceeds 40% of the mean (to dampen atypical months).
 * RG-F3: fewer than 2 full months of history → no estimate (caller must treat this as "incomplete").
 */
export function estimateMonthlyNonRecurring(monthlyTotalsMinor: bigint[]): bigint | null {
  if (monthlyTotalsMinor.length < 2) return null;

  const last3 = monthlyTotalsMinor.slice(-3);
  const mean3 = last3.reduce((a, b) => a + b, 0n) / BigInt(last3.length);

  const last6 = monthlyTotalsMinor.slice(-6);
  if (last6.length < 3) return mean3;

  const meanValue = Number(last6.reduce((a, b) => a + b, 0n)) / last6.length;
  const variance = last6.reduce((acc, v) => acc + (Number(v) - meanValue) ** 2, 0) / last6.length;
  const stdDev = Math.sqrt(variance);
  if (meanValue > 0 && stdDev / meanValue > 0.4) {
    const sorted = [...last6].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? ((sorted[mid - 1] as bigint) + (sorted[mid] as bigint)) / 2n : (sorted[mid] as bigint);
    return median;
  }

  return mean3;
}
