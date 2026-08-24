import { z } from 'zod';
import { transactionFilterSchema } from './transaction.dto';

export const savedSearchFilterSchema = transactionFilterSchema.strict();
export type SavedSearchFilter = z.infer<typeof savedSearchFilterSchema>;

export const createSavedSearchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    filter: savedSearchFilterSchema,
  })
  .strict();
export type CreateSavedSearchDto = z.infer<typeof createSavedSearchSchema>;
