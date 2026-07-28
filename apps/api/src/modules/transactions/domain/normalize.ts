import { createHash } from 'node:crypto';

const COMBINING_MARKS = /[̀-ͯ]/g;

/** RG-T6: lowercase, no accents, no punctuation, normalized spaces, reference numbers (5+ digits) masked. */
export function normalizeLabel(description: string): string {
  const withoutAccents = description.normalize('NFD').replace(COMBINING_MARKS, '');
  const lower = withoutAccents.toLowerCase();
  const withoutPunctuation = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const maskedNumbers = withoutPunctuation.replace(/\d{5,}/g, '#');
  return maskedNumbers.replace(/\s+/g, ' ').trim();
}

/** RG-T7: SHA-256 of accountId|occurredAt(date)|type|amountMinor|normalizedLabel. */
export function computeFingerprint(input: {
  accountId: string;
  occurredAt: Date;
  type: string;
  amountMinor: bigint;
  normalizedLabel: string;
}): string {
  const dateOnly = input.occurredAt.toISOString().slice(0, 10);
  const payload = `${input.accountId}|${dateOnly}|${input.type}|${input.amountMinor.toString()}|${input.normalizedLabel}`;
  return createHash('sha256').update(payload).digest('hex');
}
