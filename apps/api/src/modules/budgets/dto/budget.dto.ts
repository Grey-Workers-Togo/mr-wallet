import { z } from 'zod';

const budgetPeriodTypeEnum = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']);

export const createBudgetSchema = z
  .object({
    name: z.string().min(1).max(120),
    categoryId: z.string().uuid().optional(),
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    period: budgetPeriodTypeEnum,
    startsOn: z.coerce.date(),
    endsOn: z.coerce.date().optional(),
    rollover: z.boolean().default(false),
    alertThresholds: z.array(z.number().int().min(1).max(500)).default([80, 100]),
  })
  .strict();
export type CreateBudgetDto = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    amountMinor: z.string().regex(/^\d+$/).optional(),
    endsOn: z.coerce.date().optional(),
    rollover: z.boolean().optional(),
    alertThresholds: z.array(z.number().int().min(1).max(500)).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateBudgetDto = z.infer<typeof updateBudgetSchema>;

export const templateEnum = z.enum(['FIFTY_THIRTY_TWENTY', 'ZERO_BASED', 'CUSTOM']);

export const fromTemplateSchema = z
  .object({
    template: templateEnum,
    totalIncomeMinor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    period: budgetPeriodTypeEnum.default('MONTHLY'),
    startsOn: z.coerce.date(),
    categoryAllocations: z
      .array(z.object({ categoryId: z.string().uuid(), amountMinor: z.string().regex(/^\d+$/) }))
      .optional(),
  })
  .strict();
export type FromTemplateDto = z.infer<typeof fromTemplateSchema>;
