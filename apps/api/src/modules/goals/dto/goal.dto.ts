import { z } from 'zod';
import { unsignedAmountMinor } from '../../../common/validation/amount.schema';

const nameField = z.string().trim().min(1).max(120);

export const createGoalSchema = z
  .object({
    name: nameField,
    targetMinor: unsignedAmountMinor(),
    currency: z.string().length(3),
    targetDate: z.coerce.date().optional(),
    linkedAccountId: z.string().uuid().optional(),
    priority: z.number().int().min(0).default(0),
    color: z.string().max(20).optional(),
    icon: z.string().max(40).optional(),
  })
  .strict();
export type CreateGoalDto = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z
  .object({
    name: nameField.optional(),
    targetMinor: unsignedAmountMinor().optional(),
    targetDate: z.coerce.date().nullable().optional(),
    priority: z.number().int().min(0).optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(40).optional(),
    status: z.enum(['ACTIVE', 'ABANDONED']).optional(),
  })
  .strict();
export type UpdateGoalDto = z.infer<typeof updateGoalSchema>;

export const createContributionSchema = z
  .object({
    amountMinor: unsignedAmountMinor(),
    contributedAt: z.coerce.date(),
    notes: z.string().max(2000).optional(),
    // RG-G5: if set, the contribution also creates a real transfer from this account to the goal's linked account.
    fromAccountId: z.string().uuid().optional(),
  })
  .strict();
export type CreateContributionDto = z.infer<typeof createContributionSchema>;
