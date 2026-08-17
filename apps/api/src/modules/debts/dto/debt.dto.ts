import { z } from 'zod';
import { unsignedAmountMinor } from '../../../common/validation/amount.schema';

const nameField = z.string().trim().min(1).max(120);
const directionEnum = z.enum(['OWED_BY_ME', 'OWED_TO_ME']);
const kindEnum = z.enum(['LOAN', 'CREDIT_CARD', 'MORTGAGE', 'INFORMAL', 'INSTALLMENT', 'OTHER']);
const rateTypeEnum = z.enum(['FIXED', 'VARIABLE', 'ZERO']);
const compoundingEnum = z.enum(['NONE', 'MONTHLY', 'QUARTERLY', 'ANNUAL']);
const frequencyEnum = z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']);
const scheduleModeEnum = z.enum(['AUTO', 'MANUAL']);
const manualInstallmentField = z.object({
  dueOn: z.coerce.date(),
  totalMinor: unsignedAmountMinor(),
});

export const createDebtSchema = z
  .object({
    name: nameField,
    direction: directionEnum,
    counterparty: z.string().max(120).optional(),
    kind: kindEnum.default('LOAN'),
    linkedAccountId: z.string().uuid().optional(),
    principalMinor: unsignedAmountMinor(),
    currency: z.string().length(3),
    annualRatePct: z.number().min(0).max(100).optional(),
    rateType: rateTypeEnum.default('FIXED'),
    compounding: compoundingEnum.default('MONTHLY'),
    startedOn: z.coerce.date(),
    termDays: z.number().int().positive().optional(),
    scheduleMode: scheduleModeEnum.default('AUTO'),
    manualInstallments: z.array(manualInstallmentField).optional(),
    paymentFrequency: frequencyEnum.default('MONTHLY'),
    paymentDayOfMonth: z.number().int().min(1).max(31).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.scheduleMode !== 'MANUAL') return;
    if (v.rateType !== 'ZERO') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rateType'], message: 'MANUAL schedule requires rateType ZERO' });
    }
    const lines = v.manualInstallments ?? [];
    if (lines.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manualInstallments'], message: 'MANUAL schedule requires at least one installment' });
      return;
    }
    for (let k = 1; k < lines.length; k += 1) {
      const current = lines[k];
      const previous = lines[k - 1];
      if (current && previous && current.dueOn.getTime() <= previous.dueOn.getTime()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manualInstallments', k, 'dueOn'], message: 'dueOn must be strictly ascending' });
      }
    }
    const sum = lines.reduce((acc, l) => acc + BigInt(l.totalMinor), 0n);
    if (sum !== BigInt(v.principalMinor)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manualInstallments'], message: 'manualInstallments totals must sum to principalMinor' });
    }
  });
export type CreateDebtDto = z.infer<typeof createDebtSchema>;

export const updateDebtSchema = z
  .object({
    name: nameField.optional(),
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
    amountMinor: unsignedAmountMinor(),
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
    extraPaymentMinor: unsignedAmountMinor(),
    asOf: z.coerce.date().optional(),
  })
  .strict();
export type SimulatePayoffDto = z.infer<typeof simulatePayoffSchema>;
