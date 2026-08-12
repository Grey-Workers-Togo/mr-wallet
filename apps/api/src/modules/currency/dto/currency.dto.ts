import { z } from 'zod';
import { signedAmountMinor } from '../../../common/validation/amount.schema';

export const createRateSchema = z
  .object({
    fromCurrency: z.string().length(3),
    toCurrency: z.string().length(3),
    rate: z.string().regex(/^\d+(\.\d+)?$/),
    validFrom: z.coerce.date(),
  })
  .strict();
export type CreateRateDto = z.infer<typeof createRateSchema>;

export const convertSchema = z
  .object({
    amountMinor: signedAmountMinor(),
    from: z.string().length(3),
    to: z.string().length(3),
    at: z.coerce.date().optional(),
  })
  .strict();
export type ConvertDto = z.infer<typeof convertSchema>;
