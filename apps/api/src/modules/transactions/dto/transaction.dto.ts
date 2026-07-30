import { z } from 'zod';

const transactionTypeEnum = z.enum(['EXPENSE', 'INCOME']);
const txStatusEnum = z.enum(['PENDING', 'CLEARED', 'RECONCILED', 'VOID']);

export const createTransactionSchema = z
  .object({
    accountId: z.string().uuid(),
    type: transactionTypeEnum,
    amountMinor: z.string().regex(/^\d+$/),
    occurredAt: z.coerce.date(),
    description: z.string().min(1).max(200),
    categoryId: z.string().uuid().optional(),
    payee: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    status: txStatusEnum.default('CLEARED'),
    tagIds: z.array(z.string().uuid()).default([]),
  })
  .strict();
export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    amountMinor: z.string().regex(/^\d+$/).optional(),
    occurredAt: z.coerce.date().optional(),
    description: z.string().min(1).max(200).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    payee: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    status: txStatusEnum.optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;

export const createTransferSchema = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amountMinor: z.string().regex(/^\d+$/),
    occurredAt: z.coerce.date(),
    description: z.string().min(1).max(200).default('Transfer'),
    notes: z.string().max(500).optional(),
  })
  .strict()
  .refine((dto) => dto.fromAccountId !== dto.toAccountId, { message: 'SAME_ACCOUNT' });
export type CreateTransferDto = z.infer<typeof createTransferSchema>;

export const listTransactionsSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    minAmountMinor: z.string().regex(/^\d+$/).optional(),
    maxAmountMinor: z.string().regex(/^\d+$/).optional(),
    q: z.string().max(200).optional(),
  })
  .strict();
export type ListTransactionsDto = z.infer<typeof listTransactionsSchema>;

export const bulkIdsSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
  })
  .strict();
export type BulkIdsDto = z.infer<typeof bulkIdsSchema>;

export const bulkUpdateSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    categoryId: z.string().uuid().optional(),
    status: txStatusEnum.optional(),
  })
  .strict();
export type BulkUpdateDto = z.infer<typeof bulkUpdateSchema>;
