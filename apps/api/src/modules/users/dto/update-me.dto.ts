import { z } from 'zod';

export const updateMeSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    locale: z.enum(['fr-FR', 'en-US', 'fr', 'en']).optional(),
    timezone: z.string().min(1).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    monthStartDay: z.number().int().min(1).max(31).optional(),
  })
  .strict();

export type UpdateMeDto = z.infer<typeof updateMeSchema>;

export const updateBaseCurrencySchema = z
  .object({
    baseCurrency: z.string().length(3),
  })
  .strict();

export type UpdateBaseCurrencyDto = z.infer<typeof updateBaseCurrencySchema>;
