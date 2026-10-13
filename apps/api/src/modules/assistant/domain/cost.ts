/**
 * RG-AQ3: estimated cost from the provider's reported `usage` and a configured price. Integer
 * arithmetic only. Unit: micro-USD (millionths of a US dollar).
 */

const TOKENS_PER_MTOK = 1_000_000n;

export interface TokenPricing {
  /** Micro-USD per million input tokens. */
  inputMicrosPerMTok: number;
  /** Micro-USD per million output tokens. */
  outputMicrosPerMTok: number;
}

/** Rounded up: an estimate that errs on the cost side keeps the ceiling honest. */
export function estimateCostMicros(usage: { inputTokens: number; outputTokens: number }, pricing: TokenPricing): bigint {
  const numerator =
    BigInt(usage.inputTokens) * BigInt(pricing.inputMicrosPerMTok) +
    BigInt(usage.outputTokens) * BigInt(pricing.outputMicrosPerMTok);
  return (numerator + TOKENS_PER_MTOK - 1n) / TOKENS_PER_MTOK;
}

/**
 * Display only (the cost is stored and bounded in micro-USD). XOF has no minor unit, so the result is
 * whole francs, rounded half up. `rate` is XOF per US dollar and may have decimals.
 */
export function microUsdToXof(micros: bigint, rate: number): bigint {
  const rateThousandths = BigInt(Math.round(rate * 1000));
  const scale = TOKENS_PER_MTOK * 1000n;
  return (micros * rateThousandths * 2n + scale) / (scale * 2n);
}

/** `YYYY-MM-DD` of the UTC day: the key of an `AssistantUsage` row and the unit of the daily quota. */
export function usageDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** `YYYY-MM-01`: first UTC day of the month of `at`, the lower bound of the monthly ceiling. */
export function usageMonthStart(at: Date): string {
  return `${at.toISOString().slice(0, 7)}-01`;
}

/** First UTC day of the following month, the exclusive upper bound of the monthly ceiling. */
export function usageNextMonthStart(at: Date): string {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
