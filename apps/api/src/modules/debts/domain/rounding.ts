/** Banker's rounding (round-half-to-even) to the nearest minor unit — RG-D1. */
export function bankersRoundToBigInt(value: number): bigint {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return BigInt(floor);
  if (diff > 0.5) return BigInt(floor + 1);
  return floor % 2 === 0 ? BigInt(floor) : BigInt(floor + 1);
}
