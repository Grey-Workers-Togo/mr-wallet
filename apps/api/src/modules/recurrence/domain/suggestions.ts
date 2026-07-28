interface HistoryTransaction {
  accountId: string;
  categoryId: string | null;
  normalizedLabel: string;
  amountMinor: bigint;
  occurredAt: Date;
}

export interface RecurrenceSuggestion {
  accountId: string;
  categoryId: string | null;
  normalizedLabel: string;
  occurrenceCount: number;
  averageIntervalDays: number;
  averageAmountMinor: string;
  suggestedFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
}

const FREQUENCY_BY_DAYS: { max: number; frequency: RecurrenceSuggestion['suggestedFrequency'] }[] = [
  { max: 10, frequency: 'WEEKLY' },
  { max: 20, frequency: 'BIWEEKLY' },
  { max: 40, frequency: 'MONTHLY' },
];

/** Detects candidate recurrences in transaction history: 3+ occurrences of the same (account, category, label) at a roughly regular interval. */
export function detectSuggestions(transactions: HistoryTransaction[]): RecurrenceSuggestion[] {
  const groups = new Map<string, HistoryTransaction[]>();
  for (const tx of transactions) {
    const key = `${tx.accountId}|${tx.categoryId ?? ''}|${tx.normalizedLabel}`;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }

  const suggestions: RecurrenceSuggestion[] = [];
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const intervalsDays: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      intervalsDays.push(((sorted[i] as HistoryTransaction).occurredAt.getTime() - (sorted[i - 1] as HistoryTransaction).occurredAt.getTime()) / 86_400_000);
    }
    const avgInterval = intervalsDays.reduce((sum, d) => sum + d, 0) / intervalsDays.length;
    const variance =
      intervalsDays.reduce((sum, d) => sum + (d - avgInterval) ** 2, 0) / intervalsDays.length;
    const stdDev = Math.sqrt(variance);
    // Regular enough: standard deviation under a third of the average interval.
    if (stdDev > avgInterval / 3) continue;

    const bucket = FREQUENCY_BY_DAYS.find((b) => avgInterval <= b.max);
    if (!bucket) continue;

    const totalAmount = sorted.reduce((sum, tx) => sum + tx.amountMinor, 0n);
    const first = sorted[0] as HistoryTransaction;
    suggestions.push({
      accountId: first.accountId,
      categoryId: first.categoryId,
      normalizedLabel: first.normalizedLabel,
      occurrenceCount: sorted.length,
      averageIntervalDays: Math.round(avgInterval),
      averageAmountMinor: (totalAmount / BigInt(sorted.length)).toString(),
      suggestedFrequency: bucket.frequency,
    });
  }
  return suggestions;
}
