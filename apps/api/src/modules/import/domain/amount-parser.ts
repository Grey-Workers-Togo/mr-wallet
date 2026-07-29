export class AmountParseError extends Error {}

const CURRENCY_SYMBOLS = /[€$£¥]|CFA|FCFA|XOF|EUR|USD/gi;
const NBSP = /[  ]/g;

/**
 * docs/06 §5: no float involved. The raw string is stripped, split on the decimal separator,
 * then converted to minor units by integer arithmetic. If the file has more decimals than the
 * target currency's `minorUnits`, the row is rejected — never silently rounded.
 */
export function parseAmountToMinor(
  raw: string,
  minorUnits: number,
  decimalSeparator: string,
  thousandSeparator: string,
): bigint {
  let cleaned = raw.trim().replace(NBSP, ' ').replace(CURRENCY_SYMBOLS, '').trim();

  let negative = false;
  if (/^\(.*\)$/.test(cleaned)) {
    // Accounting format: (1 250,00) = negative.
    negative = true;
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith('-')) {
    negative = true;
    cleaned = cleaned.slice(1);
  }
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  cleaned = cleaned.split(thousandSeparator).join('').replace(/\s/g, '').replace(/'/g, '');
  const [wholePart = '0', fracPart = ''] = cleaned.split(decimalSeparator);

  if (!/^\d*$/.test(wholePart) || !/^\d*$/.test(fracPart)) {
    throw new AmountParseError('NON_NUMERIC');
  }
  if (fracPart.length > minorUnits) {
    throw new AmountParseError('TOO_MANY_DECIMALS');
  }

  const paddedFrac = fracPart.padEnd(minorUnits, '0');
  const digits = `${wholePart || '0'}${paddedFrac}` || '0';
  const value = BigInt(digits);
  return negative ? -value : value;
}
