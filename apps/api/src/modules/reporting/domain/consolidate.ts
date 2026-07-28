import * as Money from '../../../kernel/money';

export interface CurrencyAmount {
  currency: string;
  amountMinor: bigint;
}

export type RateLookup = (currency: string) => Promise<{ rate: string; fromMinorUnits: number; toMinorUnits: number }>;

/**
 * RG-RP2 simplification: converts and sums a set of per-currency totals into `baseCurrency`,
 * using one applicable rate per currency (not one rate per underlying transaction). Exact
 * per-transaction historical-rate conversion is out of scope for V1 — see docs/QUESTIONS.md.
 */
export async function consolidateToBase(amounts: CurrencyAmount[], baseCurrency: string, rateLookup: RateLookup): Promise<bigint> {
  let total = 0n;
  for (const amount of amounts) {
    if (amount.currency === baseCurrency) {
      total += amount.amountMinor;
      continue;
    }
    const { rate, fromMinorUnits, toMinorUnits } = await rateLookup(amount.currency);
    const converted = Money.convert(Money.of(amount.amountMinor, amount.currency), baseCurrency, rate, fromMinorUnits, toMinorUnits);
    total += converted.amountMinor;
  }
  return total;
}
