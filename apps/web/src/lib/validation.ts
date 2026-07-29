export const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
const EMAIL_REGEX = new RegExp(EMAIL_PATTERN);

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

export const PASSWORD_MIN_LENGTH = 12;

export const AMOUNT_PATTERN = '^[0-9]+$';
const AMOUNT_REGEX = /^[0-9]*$/;

/** Strips anything but digits, keeping amountMinor an unsigned integer string (bigint minor units, never a float). */
export function sanitizeAmountInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function isValidAmount(value: string): boolean {
  return value.length > 0 && AMOUNT_REGEX.test(value);
}

export const CURRENCY_CODE_PATTERN = '^[A-Z]{3}$';
