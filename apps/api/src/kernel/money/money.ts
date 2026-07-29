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

/** Parses a decimal string ("655.957") into an exact numerator/denominator pair — no float involved. */
function parseDecimal(value: string): { numerator: bigint; denominator: bigint } {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const numerator = BigInt(`${whole}${fraction}` || '0');
  const denominator = 10n ** BigInt(fraction.length);
  return { numerator: negative ? -numerator : numerator, denominator };
}

/** Round-half-to-even ("banker's rounding") on an exact `num/den` fraction, den > 0. */
function bankersRoundDiv(num: bigint, den: bigint): bigint {
  const negative = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const quotient = n / d;
  const remainder = n % d;
  const twiceRemainder = remainder * 2n;

  let result = quotient;
  if (twiceRemainder > d || (twiceRemainder === d && quotient % 2n === 1n)) {
    result += 1n;
  }
  return negative ? -result : result;
}

/**
 * Converts to a target currency using a decimal rate string (toCurrency per 1 fromCurrency,
 * e.g. "655.957" XOF per 1 EUR — docs/08-devises.md RG-X5/RG-X6). Exact bigint arithmetic
 * throughout, banker's rounding applied once at the target currency's minor-unit precision.
 *
 * targetMinor = round(sourceMinor × 10^(toMinorUnits − fromMinorUnits) × rate)
 */
export function convert(
  a: Money,
  toCurrency: string,
  rate: string,
  fromMinorUnits: number,
  toMinorUnits: number,
): Money {
  const { numerator, denominator } = parseDecimal(rate);
  const delta = toMinorUnits - fromMinorUnits;

  let num = a.amountMinor * numerator;
  let den = denominator;
  if (delta >= 0) {
    num *= 10n ** BigInt(delta);
  } else {
    den *= 10n ** BigInt(-delta);
  }

  return { amountMinor: bankersRoundDiv(num, den), currency: toCurrency };
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
