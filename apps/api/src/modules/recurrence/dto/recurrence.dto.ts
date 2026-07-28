import { z } from 'zod';

const transactionTypeEnum = z.enum(['EXPENSE', 'INCOME']);
const frequencyEnum = z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']);

export const createRecurrenceSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: transactionTypeEnum,
    accountId: z.string().uuid(),
    categoryId: z.string().uuid().optional(),
    amountMinor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    amountIsEstimate: z.boolean().default(false),
    frequency: frequencyEnum,
    interval: z.number().int().min(1).default(1),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startsOn: z.coerce.date(),
    endsOn: z.coerce.date().optional(),
    maxOccurrences: z.number().int().min(1).optional(),
    autoCreate: z.boolean().default(false),
    reminderDaysBefore: z.number().int().min(0).default(3),
  })
  .strict();
export type CreateRecurrenceDto = z.infer<typeof createRecurrenceSchema>;

export const updateRecurrenceSchema = createRecurrenceSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();
export type UpdateRecurrenceDto = z.infer<typeof updateRecurrenceSchema>;

export const occurrencesQuerySchema = z
  .object({
    until: z.coerce.date(),
  })
  .strict();
export type OccurrencesQueryDto = z.infer<typeof occurrencesQuerySchema>;

export const skipOccurrenceSchema = z
  .object({
    occurrenceDate: z.coerce.date(),
  })
  .strict();
export type SkipOccurrenceDto = z.infer<typeof skipOccurrenceSchema>;

export const materializeSchema = z
  .object({
    occurrenceDate: z.coerce.date(),
  })
  .strict();
export type MaterializeDto = z.infer<typeof materializeSchema>;

export const upcomingQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(365).default(30),
  })
  .strict();
export type UpcomingQueryDto = z.infer<typeof upcomingQuerySchema>;
