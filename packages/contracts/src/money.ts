import { z } from 'zod';

/** Shape shared by API and web: amounts always travel as a minor-unit string (bigint-safe over JSON) + currency. */
export const moneySchema = z.object({
  amountMinor: z.string().regex(/^-?\d+$/),
  currency: z.string().length(3),
});

export type MoneyDto = z.infer<typeof moneySchema>;
