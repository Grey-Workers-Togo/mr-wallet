export interface RateCandidate {
  rate: string;
  validFrom: Date;
  source: 'PEGGED' | 'MANUAL' | 'PROVIDER';
}

/**
 * Cascade resolution order (docs/08-devises.md §2): PEGGED always wins over anything else;
 * otherwise the most recent MANUAL/PROVIDER rate with `validFrom <= at` applies.
 * Returns null when nothing qualifies — callers surface `EXCHANGE_RATE_UNAVAILABLE`,
 * never an approximated conversion (RG-X... "aucune conversion approximative silencieuse").
 */
export function resolveRate(candidates: readonly RateCandidate[], at: Date): RateCandidate | null {
  const pegged = candidates.find((c) => c.source === 'PEGGED');
  if (pegged) return pegged;

  const applicable = candidates
    .filter((c) => c.source !== 'PEGGED' && c.validFrom.getTime() <= at.getTime())
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());

  return applicable[0] ?? null;
}
