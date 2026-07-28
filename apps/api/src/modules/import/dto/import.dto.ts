import { z } from 'zod';

const amountStrategyEnum = z.enum(['SIGNED_SINGLE_COLUMN', 'DEBIT_CREDIT_COLUMNS', 'TYPE_COLUMN']);

export const columnMappingSchema = z
  .object({
    occurredAt: z.string().min(1),
    description: z.string().min(1),
    amount: z.string().optional(),
    debit: z.string().optional(),
    credit: z.string().optional(),
    typeAmount: z.string().optional(),
    typeColumn: z.string().optional(),
    typeDebitValues: z.array(z.string()).optional(),
    payee: z.string().optional(),
    externalRef: z.string().optional(),
    notes: z.string().optional(),
    accountName: z.string().optional(),
  })
  .strict();

export const uploadImportSchema = z
  .object({
    accountId: z.string().uuid(),
    sourceId: z.string().uuid().optional(),
    mapping: columnMappingSchema,
    amountStrategy: amountStrategyEnum,
    dateFormat: z.enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']),
    decimalSeparator: z.enum([',', '.']).default(','),
    thousandSeparator: z.string().max(1).default(' '),
    force: z.boolean().default(false),
  })
  .strict();
export type UploadImportDto = z.infer<typeof uploadImportSchema>;

export const createImportSourceSchema = z
  .object({
    name: z.string().min(1).max(100),
    fileFormat: z.enum(['CSV', 'XLSX', 'XLS']),
    accountId: z.string().uuid().optional(),
    columnMapping: columnMappingSchema,
    dateFormat: z.enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']),
    decimalSeparator: z.string().max(1).default(','),
    thousandSeparator: z.string().max(1).default(' '),
    delimiter: z.string().max(1).default(';'),
    hasHeaderRow: z.boolean().default(true),
    skipRows: z.number().int().min(0).default(0),
    amountStrategy: amountStrategyEnum,
  })
  .strict();
export type CreateImportSourceDto = z.infer<typeof createImportSourceSchema>;

export const commitImportSchema = z
  .object({
    excludeRowIndexes: z.array(z.number().int()).default([]),
  })
  .strict();
export type CommitImportDto = z.infer<typeof commitImportSchema>;
