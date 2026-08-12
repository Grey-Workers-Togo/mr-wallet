export const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
const EMAIL_REGEX = new RegExp(EMAIL_PATTERN);

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export const PASSWORD_MIN_LENGTH = 12;

export const AMOUNT_PATTERN = '^(0|[1-9][0-9]*)$';
const AMOUNT_REGEX = /^(0|[1-9][0-9]*)$/;

/**
 * Strips anything but digits and collapses leading zeros ("0885" -> "885"), keeping
 * amountMinor an unsigned integer string. BigInt("0885") throws on the backend, so a
 * leading zero must never reach the API.
 */
export function sanitizeAmountInput(value: string): string {
  const digitsOnly = value.replace(/[^0-9]/g, '');
  const withoutLeadingZeros = digitsOnly.replace(/^0+(?=\d)/, '');
  return withoutLeadingZeros;
}

export function isValidAmount(value: string): boolean {
  return value.length > 0 && AMOUNT_REGEX.test(value);
}

export const CURRENCY_CODE_PATTERN = '^[A-Z]{3}$';

export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 120;

/** Trims and collapses internal whitespace so a name/label field can't be saved as blank or oddly spaced. */
export function sanitizeNameInput(value: string): string {
  return value.replace(/\s+/g, ' ').trimStart();
}

export function isValidName(value: string, maxLength = NAME_MAX_LENGTH): boolean {
  const trimmed = value.trim();
  return trimmed.length >= NAME_MIN_LENGTH && trimmed.length <= maxLength;
}
