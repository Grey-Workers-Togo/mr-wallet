import { z } from 'zod';

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();
export type DateRangeDto = z.infer<typeof dateRangeSchema>;

export const monthlySummarySchema = z
  .object({
    months: z.coerce.number().int().min(1).max(60).default(12),
  })
  .strict();
export type MonthlySummaryDto = z.infer<typeof monthlySummarySchema>;

export const comparisonSchema = z
  .object({
    currentFrom: z.coerce.date(),
    currentTo: z.coerce.date(),
    previousFrom: z.coerce.date(),
    previousTo: z.coerce.date(),
  })
  .strict();
export type ComparisonDto = z.infer<typeof comparisonSchema>;

export const topTransactionsSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
export type TopTransactionsDto = z.infer<typeof topTransactionsSchema>;
