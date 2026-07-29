import { z } from 'zod';

const accountTypeEnum = z.enum(['CASH', 'BANK', 'MOBILE_MONEY', 'CREDIT_CARD', 'SAVINGS', 'WALLET', 'OTHER']);

export const createAccountSchema = z
  .object({
    name: z.string().min(1).max(100),
    type: accountTypeEnum,
    currency: z.string().length(3),
    openingBalanceMinor: z.string().regex(/^-?\d+$/).default('0'),
    openingBalanceAt: z.coerce.date(),
    creditLimitMinor: z.string().regex(/^\d+$/).optional(),
    institution: z.string().max(100).optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
    includeInNetWorth: z.boolean().default(true),
  })
  .strict();
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    institution: z.string().max(100).optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
    includeInNetWorth: z.boolean().optional(),
    creditLimitMinor: z.string().regex(/^\d+$/).optional(),
  })
  .strict();
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;
