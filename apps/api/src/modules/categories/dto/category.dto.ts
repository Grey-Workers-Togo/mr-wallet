import { z } from 'zod';
import { clientSuppliedId } from '@budget-manager/contracts';

const categoryKindEnum = z.enum(['EXPENSE', 'INCOME', 'TRANSFER']);

export const createCategorySchema = z
  .object({
    // RG-SY3: optional client-supplied UUIDv7, for sync. Omitted by the web front today.
    id: clientSuppliedId().optional(),
    parentId: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    kind: categoryKindEnum,
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
  })
  .strict();
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    color: z.string().max(20).optional(),
    icon: z.string().max(50).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

export const reorderCategoriesSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
  })
  .strict();
export type ReorderCategoriesDto = z.infer<typeof reorderCategoriesSchema>;
