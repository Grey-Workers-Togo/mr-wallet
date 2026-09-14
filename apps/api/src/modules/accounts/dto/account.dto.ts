import { z } from 'zod';
import { clientSuppliedId } from '@budget-manager/contracts';
import { signedAmountMinor, unsignedAmountMinor } from '../../../common/validation/amount.schema';

const accountTypeEnum = z.enum(['CASH', 'BANK', 'MOBILE_MONEY', 'CREDIT_CARD', 'SAVINGS', 'WALLET', 'OTHER']);
const nameField = z.string().trim().min(1).max(100);

export const createAccountSchema = z
  .object({
    // RG-SY3: optional client-supplied UUIDv7, for sync. Omitted by the web front today.
    id: clientSuppliedId().optional(),
    name: nameField,
    type: accountTypeEnum,
    currency: z.string().length(3),
    openingBalanceMinor: signedAmountMinor().default('0'),
    openingBalanceAt: z.coerce.date(),
    creditLimitMinor: unsignedAmountMinor().optional(),
    institution: z.string().max(100).optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
    includeInNetWorth: z.boolean().default(true),
  })
  .strict();
export type CreateAccountDto = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z
  .object({
    name: nameField.optional(),
    institution: z.string().max(100).optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
    includeInNetWorth: z.boolean().optional(),
    creditLimitMinor: unsignedAmountMinor().optional(),
  })
  .strict();
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;
