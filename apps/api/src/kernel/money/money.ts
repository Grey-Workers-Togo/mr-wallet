import { CurrencyMeta, CurrencyMismatchError, Money } from './money.types';

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function of(amountMinor: bigint, currency: string): Money {
  return { amountMinor, currency };
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negate(a: Money): Money {
  return { amountMinor: -a.amountMinor, currency: a.currency };
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0n;
}

export function isNegative(a: Money): boolean {
  return a.amountMinor < 0n;
}

export function isPositive(a: Money): boolean {
  return a.amountMinor > 0n;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

/**
 * Multiplies a Money by an integer scalar (e.g. quantity). Never accepts a float:
 * fractional scaling belongs to `allocate`, which distributes the remainder deterministically.
 */
export function multiplyByInt(a: Money, factor: bigint): Money {
  return { amountMinor: a.amountMinor * factor, currency: a.currency };
}

/**
 * Splits a Money into `parts` shares proportional to `ratios`, largest-remainder method.
 * Guarantees the shares sum exactly back to the original amount — no cent lost or invented.
 */
export function allocate(a: Money, ratios: readonly number[]): Money[] {
  if (ratios.length === 0) {
    throw new Error('allocate requires at least one ratio');
  }
  const ratioTotal = ratios.reduce((sum, r) => sum + r, 0);
  if (ratioTotal <= 0) {
    throw new Error('allocate requires a positive ratio total');
  }

  const total = a.amountMinor;
  const isNeg = total < 0n;
  const absTotal = isNeg ? -total : total;

  const rawShares = ratios.map((r) => (absTotal * BigInt(Math.round(r * 1_000_000))) / BigInt(Math.round(ratioTotal * 1_000_000)));
  const distributed = rawShares.reduce((sum, s) => sum + s, 0n);
  let remainder = absTotal - distributed;

  const shares = [...rawShares];
  let i = 0;
  while (remainder > 0n) {
    const idx = i % shares.length;
    shares[idx] = (shares[idx] ?? 0n) + 1n;
    remainder -= 1n;
    i += 1;
  }

  return shares.map((s) => ({ amountMinor: isNeg ? -s : s, currency: a.currency }));
}

/**
 * Converts to a target currency using a decimal rate expressed as toCurrency per 1 fromCurrency
 * (whole units, not minor units — e.g. 655.957 XOF per 1 EUR).
 * Rounds half up at the target currency's minor unit precision — rounding happens once, at conversion, never silently elsewhere.
 */
export function convert(
  a: Money,
  toCurrency: string,
  rate: number,
  fromMinorUnits: number,
  toMinorUnits: number,
): Money {
  const wholeUnits = Number(a.amountMinor) / 10 ** fromMinorUnits;
  const convertedWholeUnits = wholeUnits * rate;
  const targetMinor = Math.round(convertedWholeUnits * 10 ** toMinorUnits);
  return { amountMinor: BigInt(targetMinor), currency: toCurrency };
}

/**
 * Formats for display only. Rounding/precision comes from `CurrencyMeta.minorUnits`,
 * never hardcoded — a currency with 0 decimals (XOF) must never be divided by 100.
 */
export function format(a: Money, meta: CurrencyMeta, locale: string): string {
  if (meta.code !== a.currency) {
    throw new CurrencyMismatchError(a.currency, meta.code);
  }
  const divisor = 10 ** meta.minorUnits;
  const value = Number(a.amountMinor) / divisor;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: a.currency,
    minimumFractionDigits: meta.minorUnits,
    maximumFractionDigits: meta.minorUnits,
  }).format(value);
}
