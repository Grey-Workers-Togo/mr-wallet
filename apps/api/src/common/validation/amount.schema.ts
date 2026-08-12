import { z } from 'zod';

/**
 * amountMinor strings feed BigInt() directly (docs/10-conventions-dev.md §money rules).
 * BigInt("0885") throws — leading zeros are not valid BigInt literals — so the pattern
 * must reject them here instead of letting the service layer crash on a 500.
 */
const UNSIGNED_MINOR_PATTERN = /^(0|[1-9]\d*)$/;
const SIGNED_MINOR_PATTERN = /^-?(0|[1-9]\d*)$/;

export const unsignedAmountMinor = () => z.string().regex(UNSIGNED_MINOR_PATTERN);
export const signedAmountMinor = () => z.string().regex(SIGNED_MINOR_PATTERN);
