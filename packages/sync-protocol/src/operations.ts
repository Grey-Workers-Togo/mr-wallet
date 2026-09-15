import { z } from 'zod';
import { clientSuppliedId, moneySchema } from '@budget-manager/contracts';

/**
 * The operation catalogue (docs/14-sync-protocol.md § 2.1). Adding a row here is a change to
 * this package and requires handling on both sides in the same commit (RG-SY5) — today that
 * means the API's sync module only, since no client exists yet (M1+, out of scope).
 *
 * Payload schemas here are the sync-wire shape, independent of each REST module's own DTO
 * schema. Duplication is accepted for now (no second real consumer exists yet to force
 * consolidation); RG-SY4's "same Zod schema on both sides" becomes load-bearing once a client
 * is built.
 */
export const OPERATION_NAMES = [
  'account.create',
  'account.update',
  'account.archive',
  'account.delete',
  'account.reconcile',
  'transaction.create',
  'transaction.update',
  'transaction.delete',
  'transaction.bulkCategorize',
  'transaction.setTags',
  'transfer.create',
  'category.create',
  'category.update',
  'category.delete',
  'tag.create',
  'tag.delete',
  'budget.create',
  'budget.update',
  'budget.delete',
  'budget.planCreate',
  'goal.create',
  'goal.update',
  'goal.delete',
  'goal.contribute',
  'debt.create',
  'debt.update',
  'debt.recordPayment',
  'debt.simulateEarlyRepayment',
  'recurrence.create',
  'recurrence.update',
  'recurrence.delete',
  'recurrence.skipOccurrence',
  'notification.markRead',
  // 'attachment.create' deliberately excluded from M0 — see docs/QUESTIONS.md.
] as const;

export type OperationName = (typeof OPERATION_NAMES)[number];

const entityId = z.string().uuid();

const accountCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  name: z.string().min(1),
  type: z.enum(['CASH', 'BANK', 'MOBILE_MONEY', 'CREDIT_CARD', 'SAVINGS', 'WALLET', 'OTHER']),
  currency: z.string().length(3),
  openingBalanceMinor: moneySchema.shape.amountMinor,
  openingBalanceAt: z.string(),
});

const accountUpdateSchema = z.object({ id: entityId }).and(accountCreateSchema.partial());
const accountArchiveSchema = z.object({ id: entityId });
const accountDeleteSchema = z.object({ id: entityId });
// Mirrors accounts.service.ts's current reconcile(userId, id) (stored-vs-computed drift check,
// docs/03 § 16) — no user-declared balance yet. Lot 19 (docs/12 § Lot 19) changes this payload to
// carry the declared actual balance + date (docs/14 § 2.1) in the same commit as the endpoint's
// new contract; not done yet, so the op keeps today's shape until then (RG-SY5).
const accountReconcileSchema = z.object({
  accountId: entityId,
});

// currency is inferred server-side from the account, never accepted from the client — matches
// transactions.dto.ts's createTransactionSchema exactly (no currency field there either).
// feeMinor: RG-T12, one optional field, never stored (RG-T12a).
const transactionCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  accountId: entityId,
  type: z.enum(['EXPENSE', 'INCOME']),
  amountMinor: moneySchema.shape.amountMinor,
  occurredAt: z.string(),
  description: z.string().min(1),
  categoryId: entityId.optional(),
  payee: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(entityId).optional(),
  feeMinor: moneySchema.shape.amountMinor.optional(),
});

// baseVersion travels on the Operation envelope (sibling of payload), not duplicated here.
// feeMinor is overridden nullable here — RG-T12b: null (or 0) deletes the fee line on update.
const transactionUpdateSchema = z
  .object({ id: entityId })
  .and(transactionCreateSchema.omit({ id: true }).partial())
  .and(z.object({ feeMinor: moneySchema.shape.amountMinor.nullable().optional() }));
const transactionDeleteSchema = z.object({ id: entityId });
const transactionBulkCategorizeSchema = z.object({ ids: z.array(entityId).min(1), categoryId: entityId });
const transactionSetTagsSchema = z.object({ id: entityId, tagIds: z.array(entityId) });

// Matches transaction.dto.ts's createTransferSchema exactly: no currency (inferred per leg from
// its own account), no cross-currency toAmountMinor/toCurrency. feeMinor attaches to the
// outbound leg (RG-T11).
const transferCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  fromAccountId: entityId,
  toAccountId: entityId,
  amountMinor: moneySchema.shape.amountMinor,
  feeMinor: moneySchema.shape.amountMinor.optional(),
  occurredAt: z.string(),
  description: z.string().min(1),
  notes: z.string().optional(),
});

const categoryCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  parentId: entityId.optional(),
  name: z.string().min(1),
  kind: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  color: z.string().optional(),
  icon: z.string().optional(),
});
const categoryUpdateSchema = z.object({ id: entityId }).and(categoryCreateSchema.omit({ id: true }).partial());
const categoryDeleteSchema = z.object({ id: entityId, reassignToCategoryId: entityId.optional() });

const tagCreateSchema = z.object({ id: clientSuppliedId().optional(), name: z.string().min(1), color: z.string().optional() });
const tagDeleteSchema = z.object({ id: entityId });

const budgetCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  name: z.string().min(1),
  categoryId: entityId.optional(),
  amountMinor: moneySchema.shape.amountMinor,
  currency: z.string().length(3),
  period: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']),
  startsOn: z.string(),
  endsOn: z.string().optional(),
  rollover: z.boolean().optional(),
});
const budgetUpdateSchema = z.object({ id: entityId }).and(budgetCreateSchema.omit({ id: true }).partial());
const budgetDeleteSchema = z.object({ id: entityId });
// Mirrors budgets.service.ts's fromTemplate() (docs/12 Lot 17) — an atomic plan built from a
// template + income, not a list of pre-built budgets.
const budgetPlanCreateSchema = z.object({
  template: z.enum(['FIFTY_THIRTY_TWENTY', 'ZERO_BASED', 'CUSTOM']),
  totalIncomeMinor: moneySchema.shape.amountMinor,
  currency: z.string().length(3),
  period: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']).optional(),
  startsOn: z.string(),
  categoryAllocations: z.array(z.object({ categoryId: entityId, amountMinor: moneySchema.shape.amountMinor })).optional(),
});

const goalCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  name: z.string().min(1),
  targetMinor: moneySchema.shape.amountMinor,
  currency: z.string().length(3),
  targetDate: z.string().optional(),
  linkedAccountId: entityId.optional(),
});
const goalUpdateSchema = z.object({ id: entityId }).and(goalCreateSchema.omit({ id: true }).partial());
const goalDeleteSchema = z.object({ id: entityId });
const goalContributeSchema = z.object({
  id: clientSuppliedId().optional(),
  goalId: entityId,
  amountMinor: moneySchema.shape.amountMinor,
  contributedAt: z.string(),
});

const debtCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  name: z.string().min(1),
  direction: z.enum(['OWED_BY_ME', 'OWED_TO_ME']),
  principalMinor: moneySchema.shape.amountMinor,
  currency: z.string().length(3),
  startedOn: z.string(),
});
const debtUpdateSchema = z.object({ id: entityId }).and(debtCreateSchema.omit({ id: true }).partial());
const debtRecordPaymentSchema = z.object({
  id: clientSuppliedId().optional(),
  debtId: entityId,
  amountMinor: moneySchema.shape.amountMinor,
  paidAt: z.string(),
});
const debtSimulateEarlyRepaymentSchema = z.object({
  debtId: entityId,
  extraPaymentMinor: moneySchema.shape.amountMinor,
  asOf: z.string().optional(),
});

const recurrenceCreateSchema = z.object({
  id: clientSuppliedId().optional(),
  name: z.string().min(1),
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  accountId: entityId,
  categoryId: entityId.optional(),
  amountMinor: moneySchema.shape.amountMinor,
  currency: z.string().length(3),
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']),
  startsOn: z.string(),
});
const recurrenceUpdateSchema = z.object({ id: entityId }).and(recurrenceCreateSchema.omit({ id: true }).partial());
const recurrenceDeleteSchema = z.object({ id: entityId });
const recurrenceSkipOccurrenceSchema = z.object({ id: entityId, occurrenceDate: z.string() });

const notificationMarkReadSchema = z.object({ id: entityId });

/** One payload schema per catalogue row — keys must exactly match {@link OPERATION_NAMES}. */
export const OPERATION_PAYLOAD_SCHEMAS = {
  'account.create': accountCreateSchema,
  'account.update': accountUpdateSchema,
  'account.archive': accountArchiveSchema,
  'account.delete': accountDeleteSchema,
  'account.reconcile': accountReconcileSchema,
  'transaction.create': transactionCreateSchema,
  'transaction.update': transactionUpdateSchema,
  'transaction.delete': transactionDeleteSchema,
  'transaction.bulkCategorize': transactionBulkCategorizeSchema,
  'transaction.setTags': transactionSetTagsSchema,
  'transfer.create': transferCreateSchema,
  'category.create': categoryCreateSchema,
  'category.update': categoryUpdateSchema,
  'category.delete': categoryDeleteSchema,
  'tag.create': tagCreateSchema,
  'tag.delete': tagDeleteSchema,
  'budget.create': budgetCreateSchema,
  'budget.update': budgetUpdateSchema,
  'budget.delete': budgetDeleteSchema,
  'budget.planCreate': budgetPlanCreateSchema,
  'goal.create': goalCreateSchema,
  'goal.update': goalUpdateSchema,
  'goal.delete': goalDeleteSchema,
  'goal.contribute': goalContributeSchema,
  'debt.create': debtCreateSchema,
  'debt.update': debtUpdateSchema,
  'debt.recordPayment': debtRecordPaymentSchema,
  'debt.simulateEarlyRepayment': debtSimulateEarlyRepaymentSchema,
  'recurrence.create': recurrenceCreateSchema,
  'recurrence.update': recurrenceUpdateSchema,
  'recurrence.delete': recurrenceDeleteSchema,
  'recurrence.skipOccurrence': recurrenceSkipOccurrenceSchema,
  'notification.markRead': notificationMarkReadSchema,
} satisfies Record<OperationName, z.ZodTypeAny>;

/** RG-SY1: an operation is an intent, never a computed result — enforced by the schemas above never accepting a delta/balance field. */
export const operationEnvelopeSchema = z.object({
  id: clientSuppliedId(),
  op: z.enum(OPERATION_NAMES),
  payload: z.unknown(),
  baseVersion: z.string().optional(),
  clientTime: z.string(),
});

export type OperationEnvelope = z.infer<typeof operationEnvelopeSchema>;

export function parseOperationPayload(op: OperationName, payload: unknown) {
  return OPERATION_PAYLOAD_SCHEMAS[op].parse(payload);
}
