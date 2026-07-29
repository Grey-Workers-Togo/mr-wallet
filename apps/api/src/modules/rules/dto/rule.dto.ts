import { z } from 'zod';

const matchFieldEnum = z.enum(['DESCRIPTION', 'PAYEE', 'EXTERNAL_REF']);
const matchTypeEnum = z.enum(['CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH', 'REGEX']);

export const createRuleSchema = z
  .object({
    priority: z.number().int().default(0),
    matchField: matchFieldEnum.default('DESCRIPTION'),
    matchType: matchTypeEnum.default('CONTAINS'),
    matchValue: z.string().min(1).max(200),
    minAmountMinor: z.string().regex(/^\d+$/).optional(),
    maxAmountMinor: z.string().regex(/^\d+$/).optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid(),
    addTagIds: z.array(z.string().uuid()).default([]),
    setPayee: z.string().max(120).optional(),
  })
  .strict();
export type CreateRuleDto = z.infer<typeof createRuleSchema>;

export const updateRuleSchema = z
  .object({
    priority: z.number().int().optional(),
    matchField: matchFieldEnum.optional(),
    matchType: matchTypeEnum.optional(),
    matchValue: z.string().min(1).max(200).optional(),
    minAmountMinor: z.string().regex(/^\d+$/).optional(),
    maxAmountMinor: z.string().regex(/^\d+$/).optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    addTagIds: z.array(z.string().uuid()).optional(),
    setPayee: z.string().max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateRuleDto = z.infer<typeof updateRuleSchema>;
