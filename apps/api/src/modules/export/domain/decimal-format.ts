/** Exact bigint → decimal string, no float involved (mirrors kernel/money display rules). */
export function toDecimalString(amountMinor: bigint, minorUnits: number): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const divisor = 10n ** BigInt(minorUnits);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(minorUnits, '0');
  const value = minorUnits > 0 ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${value}` : value;
}
