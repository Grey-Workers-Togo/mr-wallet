/**
 * `amountMinor` (and every other BigInt column) always travels over JSON as a string
 * (docs/05-api.md §1: BigInt exceeds Number.MAX_SAFE_INTEGER, JSON has no arbitrary-precision
 * integer). This is the single place that enables it — no per-controller mapping needed.
 */
export function installBigIntJsonSerialization(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function (this: bigint) {
    return this.toString();
  };
}
