import { z } from 'zod';

export const exportTransactionsSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    format: z.enum(['CSV', 'XLSX']).default('CSV'),
  })
  .strict();
export type ExportTransactionsDto = z.infer<typeof exportTransactionsSchema>;

export const exportFullSchema = z
  .object({
    format: z.enum(['CSV', 'XLSX']).default('CSV'),
  })
  .strict();
export type ExportFullDto = z.infer<typeof exportFullSchema>;
