import type { Binding } from './types';

/**
 * Values travel structured and are formatted here, as everywhere else in the product (ADR-0018 §4).
 * Money never goes through a float: the minor-unit string is split with BigInt.
 */

export interface FormatContext {
  /** BCP 47 tag, e.g. `fr-FR`. */
  locale: string;
  /** Minor units per currency code (`XOF` → 0, `EUR` → 2). An unknown currency is shown whole. */
  minorUnitsByCode: Record<string, number>;
  /** "from … to …" in the user's language: a complete message, not a fragment (CLAUDE.md "Langues"). */
  periodPhrase: (from: string, to: string) => string;
}

export function formatMinor(amountMinor: string, currency: string, minorUnits: number, locale: string): string {
  const value = BigInt(amountMinor);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const divisor = 10n ** BigInt(minorUnits);
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true }).format(magnitude / divisor);
  let text = whole;
  if (minorUnits > 0) {
    const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
    text += decimal + (magnitude % divisor).toString().padStart(minorUnits, '0');
  }
  return `${negative ? '-' : ''}${text} ${currency}`;
}

/** `YYYY-MM-DD`, a local calendar day: formatted in UTC so the browser's timezone cannot shift it. */
export function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

/** `YYYY-MM` as a month and year. */
export function formatMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

export function formatPercent(basisPoints: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(basisPoints / 10_000);
}

export function formatBinding(binding: Binding, context: FormatContext): string {
  switch (binding.type) {
    case 'money':
      return formatMinor(
        binding.amountMinor,
        binding.currency,
        context.minorUnitsByCode[binding.currency] ?? 0,
        context.locale,
      );
    case 'percent':
      return formatPercent(binding.basisPoints, context.locale);
    case 'period':
      return context.periodPhrase(formatDay(binding.from, context.locale), formatDay(binding.to, context.locale));
    case 'date':
      return formatDay(binding.value, context.locale);
    case 'count':
      return new Intl.NumberFormat(context.locale).format(binding.value);
  }
}
