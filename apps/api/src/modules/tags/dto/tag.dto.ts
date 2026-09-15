import { z } from 'zod';
import { clientSuppliedId } from '@budget-manager/contracts';

export const createTagSchema = z
  .object({
    // RG-SY3: optional client-supplied UUIDv7, for sync. Omitted by the web front today.
    id: clientSuppliedId().optional(),
    name: z.string().min(1).max(50),
    color: z.string().max(20).optional(),
  })
  .strict();
export type CreateTagDto = z.infer<typeof createTagSchema>;

export const updateTagSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    color: z.string().max(20).optional(),
  })
  .strict();
export type UpdateTagDto = z.infer<typeof updateTagSchema>;
