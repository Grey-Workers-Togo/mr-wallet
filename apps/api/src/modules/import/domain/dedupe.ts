import { jaroWinkler } from './similarity';

export interface ExistingTransactionForDedupe {
  id: string;
  accountId: string;
  amountMinor: bigint;
  occurredAt: Date;
  normalizedLabel: string;
  fingerprint: string;
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SIMILARITY_THRESHOLD = 0.85;

/** docs/06 §7 level 3: same account, same amount, date within ±3 days, label similarity ≥ 0.85. */
export function findProbableDuplicate(
  candidate: { accountId: string; amountMinor: bigint; occurredAt: Date; normalizedLabel: string },
  existing: ExistingTransactionForDedupe[],
): ExistingTransactionForDedupe | null {
  for (const tx of existing) {
    if (tx.accountId !== candidate.accountId) continue;
    if (tx.amountMinor !== candidate.amountMinor) continue;
    const dayDelta = Math.abs(tx.occurredAt.getTime() - candidate.occurredAt.getTime());
    if (dayDelta > THREE_DAYS_MS) continue;
    if (jaroWinkler(tx.normalizedLabel, candidate.normalizedLabel) >= SIMILARITY_THRESHOLD) {
      return tx;
    }
  }
  return null;
}
