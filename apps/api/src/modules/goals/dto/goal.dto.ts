import { z } from 'zod';

export const createGoalSchema = z
  .object({
    name: z.string().min(1).max(120),
    targetMinor: z.string().regex(/^\d+$/),
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
    name: z.string().min(1).max(120).optional(),
    targetMinor: z.string().regex(/^\d+$/).optional(),
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
    amountMinor: z.string().regex(/^\d+$/),
    contributedAt: z.coerce.date(),
    notes: z.string().max(2000).optional(),
    // RG-G5: if set, the contribution also creates a real transfer from this account to the goal's linked account.
    fromAccountId: z.string().uuid().optional(),
  })
  .strict();
export type CreateContributionDto = z.infer<typeof createContributionSchema>;
