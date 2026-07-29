/**
 * EXPENSE decreases the account balance, INCOME increases it. Transfer legs reuse these two
 * types (docs/02 — `TRANSFER` is never actually persisted by this module, kept only for the
 * shared Prisma enum), so any non-INCOME type is treated as a decrease.
 */
export function balanceDelta(type: 'EXPENSE' | 'INCOME' | 'TRANSFER', amountMinor: bigint): bigint {
  return type === 'INCOME' ? amountMinor : -amountMinor;
}
