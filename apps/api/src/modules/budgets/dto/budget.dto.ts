import { z } from 'zod';
import { unsignedAmountMinor } from '../../../common/validation/amount.schema';

const budgetPeriodTypeEnum = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']);
const nameField = z.string().trim().min(1).max(120);

export const createBudgetSchema = z
  .object({
    name: nameField,
    categoryId: z.string().uuid().optional(),
    amountMinor: unsignedAmountMinor(),
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
    name: nameField.optional(),
    amountMinor: unsignedAmountMinor().optional(),
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
    totalIncomeMinor: unsignedAmountMinor(),
    currency: z.string().length(3),
    period: budgetPeriodTypeEnum.default('MONTHLY'),
    startsOn: z.coerce.date(),
    categoryAllocations: z
      .array(z.object({ categoryId: z.string().uuid(), amountMinor: unsignedAmountMinor() }))
      .optional(),
  })
  .strict();
export type FromTemplateDto = z.infer<typeof fromTemplateSchema>;
