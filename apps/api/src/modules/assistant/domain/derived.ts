/**
 * RG-AT5: a share, a difference or any derived value is computed by code in integer arithmetic,
 * never by the model. Differences of money go through the `money` kernel (`subtract`).
 */

/**
 * `part / whole` in basis points (1 bp = 0.01 %), rounded half away from zero.
 * Null when `whole` is not strictly positive: a share of nothing is not 0 %, it is undefined.
 */
export function shareBasisPoints(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  const negative = part < 0n;
  const magnitude = negative ? -part : part;
  const rounded = (magnitude * 10_000n * 2n + whole) / (whole * 2n);
  return Number(negative ? -rounded : rounded);
}
