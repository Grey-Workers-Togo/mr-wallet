import { z } from 'zod';

const directionEnum = z.enum(['OWED_BY_ME', 'OWED_TO_ME']);
const kindEnum = z.enum(['LOAN', 'CREDIT_CARD', 'MORTGAGE', 'INFORMAL', 'INSTALLMENT', 'OTHER']);
const rateTypeEnum = z.enum(['FIXED', 'VARIABLE', 'ZERO']);
const compoundingEnum = z.enum(['NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL']);
const frequencyEnum = z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']);

export const createDebtSchema = z
  .object({
    name: z.string().min(1).max(120),
    direction: directionEnum,
    counterparty: z.string().max(120).optional(),
    kind: kindEnum.default('LOAN'),
    linkedAccountId: z.string().uuid().optional(),
    principalMinor: z.string().regex(/^\d+$/),
    currency: z.string().length(3),
    annualRatePct: z.number().min(0).max(100).optional(),
    rateType: rateTypeEnum.default('FIXED'),
    compounding: compoundingEnum.default('MONTHLY'),
    startedOn: z.coerce.date(),
    termMonths: z.number().int().positive().optional(),
    paymentFrequency: frequencyEnum.default('MONTHLY'),
    paymentDayOfMonth: z.number().int().min(1).max(31).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type CreateDebtDto = z.infer<typeof createDebtSchema>;

export const updateDebtSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    counterparty: z.string().max(120).optional(),
    linkedAccountId: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).optional(),
    status: z.enum(['ACTIVE', 'DEFAULTED', 'CANCELLED']).optional(),
  })
  .strict();
export type UpdateDebtDto = z.infer<typeof updateDebtSchema>;

export const recordPaymentSchema = z
  .object({
    paidAt: z.coerce.date(),
    amountMinor: z.string().regex(/^\d+$/),
    installmentId: z.string().uuid().optional(),
    isExtraPayment: z.boolean().default(false),
    description: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.isExtraPayment || v.installmentId, {
    message: 'installmentId required unless isExtraPayment',
    path: ['installmentId'],
  });
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;

export const regenerateScheduleSchema = z
  .object({
    strategy: z.enum(['REDUCE_TERM', 'REDUCE_INSTALLMENT']).default('REDUCE_TERM'),
  })
  .strict();
export type RegenerateScheduleDto = z.infer<typeof regenerateScheduleSchema>;

export const simulatePayoffSchema = z
  .object({
    extraPaymentMinor: z.string().regex(/^\d+$/),
    asOf: z.coerce.date().optional(),
  })
  .strict();
export type SimulatePayoffDto = z.infer<typeof simulatePayoffSchema>;
