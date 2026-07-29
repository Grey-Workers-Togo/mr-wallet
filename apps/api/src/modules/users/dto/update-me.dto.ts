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

export const setPinSchema = z
  .object({
    pin: z.string().regex(/^\d{4,8}$/),
    lockMinutes: z.number().int().min(1).max(60).optional(),
  })
  .strict();

export type SetPinDto = z.infer<typeof setPinSchema>;

export const verifyPinSchema = z
  .object({
    pin: z.string().regex(/^\d{4,8}$/),
  })
  .strict();

export type VerifyPinDto = z.infer<typeof verifyPinSchema>;
