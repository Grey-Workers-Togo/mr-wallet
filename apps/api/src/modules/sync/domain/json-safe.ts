/**
 * Recursively converts BigInt → string and Date → ISO string, so a Prisma entity (amountMinor
 * fields, timestamptz columns) can be stored in the IdempotencyKey's `Json` column or returned
 * in a push result. Self-contained: does not rely on `installBigIntJsonSerialization()` (a
 * global BigInt.prototype.toJSON patch installed at app bootstrap in main.ts) having run — this
 * runs inside unit tests too, which construct services directly without bootstrapping the app.
 */
export function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toJsonSafe(v)]));
  }
  return value;
}
