import { z } from 'zod';
import type { OperationName } from '@budget-manager/sync-protocol';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { createAccountSchema, updateAccountSchema } from '../../accounts/dto/account.dto';
import { TransactionsFacade } from '../../transactions/transactions.facade';
import {
  bulkUpdateSchema,
  createTransactionSchema,
  createTransferSchema,
  updateTransactionSchema,
} from '../../transactions/dto/transaction.dto';
import { CategoriesFacade } from '../../categories/categories.facade';
import { createCategorySchema, updateCategorySchema } from '../../categories/dto/category.dto';
import { TagsFacade } from '../../tags/tags.facade';
import { createTagSchema } from '../../tags/dto/tag.dto';
import { BudgetsFacade } from '../../budgets/budgets.facade';
import { createBudgetSchema, fromTemplateSchema, updateBudgetSchema } from '../../budgets/dto/budget.dto';
import { GoalsFacade } from '../../goals/goals.facade';
import { createContributionSchema, createGoalSchema, updateGoalSchema } from '../../goals/dto/goal.dto';
import { DebtsFacade } from '../../debts/debts.facade';
import { createDebtSchema, recordPaymentSchema, simulatePayoffSchema, updateDebtSchema } from '../../debts/dto/debt.dto';
import { RecurrenceFacade } from '../../recurrence/recurrence.facade';
import { createRecurrenceSchema, updateRecurrenceSchema } from '../../recurrence/dto/recurrence.dto';
import { NotificationsFacade } from '../../notifications/notifications.facade';
import { checkVersion } from './sync-conflict.error';

/** `{ id, ...rest }` — every update/delete-style payload targets an existing entity by id. */
const entityRefSchema = z.object({ id: z.string() }).passthrough();

const categoryDeleteSchema = z.object({ id: z.string(), reassignToCategoryId: z.string().optional() });
const recurrenceSkipSchema = z.object({ id: z.string(), occurrenceDate: z.coerce.date() });
const notificationMarkReadSchema = z.object({ id: z.string() });
const debtRecordPaymentEnvelope = z.object({ debtId: z.string() }).passthrough();
const debtSimulateEnvelope = z.object({ debtId: z.string() }).passthrough();
const goalContributeEnvelope = z.object({ goalId: z.string() }).passthrough();
const accountReconcileSchema = z.object({ accountId: z.string() });

export type OperationHandler = (userId: string, payload: unknown, baseVersion?: string) => Promise<unknown>;

/**
 * One handler per catalogue entry (docs/14-sync-protocol.md § 2.1), built from the business
 * modules' own facades — sync owns no business rule of its own (docs/14 § 5). Each handler
 * re-validates the raw payload against the module's OWN authoritative Zod schema rather than
 * the sync-protocol package's schema: the latter is a wire-shape contract (and the catalogue
 * completeness check), the former is the single source of truth for what a create/update
 * actually accepts, so there is exactly one place this can drift.
 */
export function buildDispatchTable(facades: {
  accounts: AccountsFacade;
  transactions: TransactionsFacade;
  categories: CategoriesFacade;
  tags: TagsFacade;
  budgets: BudgetsFacade;
  goals: GoalsFacade;
  debts: DebtsFacade;
  recurrence: RecurrenceFacade;
  notifications: NotificationsFacade;
}): Record<OperationName, OperationHandler> {
  const { accounts, transactions, categories, tags, budgets, goals, debts, recurrence, notifications } = facades;

  return {
    'account.create': (userId, payload) => accounts.create(userId, createAccountSchema.parse(payload)),
    'account.update': async (userId, payload, baseVersion) => {
      const { id, ...rest } = entityRefSchema.parse(payload);
      await checkVersion(() => accounts.getById(userId, id), baseVersion);
      return accounts.update(userId, id, updateAccountSchema.parse(rest));
    },
    'account.archive': async (userId, payload, baseVersion) => {
      const { id } = entityRefSchema.parse(payload);
      await checkVersion(() => accounts.getById(userId, id), baseVersion);
      return accounts.archive(userId, id);
    },
    'account.delete': async (userId, payload, baseVersion) => {
      const { id } = entityRefSchema.parse(payload);
      await checkVersion(() => accounts.getById(userId, id), baseVersion);
      await accounts.remove(userId, id);
      return { id };
    },
    'account.reconcile': (userId, payload) => {
      const { accountId } = accountReconcileSchema.parse(payload);
      return accounts.reconcile(userId, accountId);
    },

    'transaction.create': (userId, payload) => transactions.create(userId, createTransactionSchema.parse(payload)),
    'transaction.update': async (userId, payload, baseVersion) => {
      const { id, ...rest } = entityRefSchema.parse(payload);
      await checkVersion(() => transactions.getById(userId, id), baseVersion);
      return transactions.update(userId, id, updateTransactionSchema.parse(rest));
    },
    'transaction.delete': async (userId, payload, baseVersion) => {
      const { id } = entityRefSchema.parse(payload);
      await checkVersion(() => transactions.getById(userId, id), baseVersion);
      await transactions.remove(userId, id);
      return { id };
    },
    'transaction.bulkCategorize': (userId, payload) => transactions.bulkUpdate(userId, bulkUpdateSchema.parse(payload)),
    'transaction.setTags': async (userId, payload, baseVersion) => {
      const { id, tagIds } = z.object({ id: z.string(), tagIds: z.array(z.string()) }).parse(payload);
      await checkVersion(() => transactions.getById(userId, id), baseVersion);
      return transactions.update(userId, id, updateTransactionSchema.parse({ tagIds }));
    },
    'transfer.create': (userId, payload) => transactions.transfer(userId, createTransferSchema.parse(payload)),

    'category.create': (userId, payload) => categories.create(userId, createCategorySchema.parse(payload)),
    'category.update': async (userId, payload, baseVersion) => {
      const { id, ...rest } = entityRefSchema.parse(payload);
      await checkVersion(() => categories.getById(userId, id), baseVersion);
      return categories.update(userId, id, updateCategorySchema.parse(rest));
    },
    'category.delete': async (userId, payload, baseVersion) => {
      const { id, reassignToCategoryId } = categoryDeleteSchema.parse(payload);
      await checkVersion(() => categories.getById(userId, id), baseVersion);
      return categories.remove(userId, id, reassignToCategoryId);
    },

    'tag.create': (userId, payload) => tags.create(userId, createTagSchema.parse(payload)),
    'tag.delete': async (userId, payload, baseVersion) => {
      const { id } = entityRefSchema.parse(payload);
      await checkVersion(() => tags.getById(userId, id), baseVersion);
      await tags.remove(userId, id);
      return { id };
    },

    'budget.create': (userId, payload) => budgets.create(userId, createBudgetSchema.parse(payload)),
    'budget.update': async (userId, payload, baseVersion) => {
      const { id, ...rest } = entityRefSchema.parse(payload);
      await checkVersion(() => budgets.getById(userId, id), baseVersion);
      return budgets.update(userId, id, updateBudgetSchema.parse(rest));
    },
    'budget.delete': async (userId, payload, baseVersion) => {
      const { id } = entityRefSchema.parse(payload);
      await checkVersion(() => budgets.getById(userId, id), baseVersion);
      await budgets.remove(userId, id);
      return { id };
    },
    'budget.planCreate': (userId, payload) => budgets.planCreate(userId, fromTemplateSchema.parse(payload)),

    'goal.create': (userId, payload) => goals.create(userId, createGoalSchema.parse(payload)),
    'goal.update': async (userId, payload, baseVersion) => {
      const { id, ...rest } = entityRefSchema.parse(payload);
      await checkVersion(() => goals.getById(userId, id), baseVersion);
      return goals.update(userId, id, updateGoalSchema.parse(rest));
    },
    'goal.delete': async (userId, payload, baseVersion) => {
      const { id } = entityRefSchema.parse(payload);
      await checkVersion(() => goals.getById(userId, id), baseVersion);
      await goals.remove(userId, id);
      return { id };
    },
    'goal.contribute': (userId, payload) => {
      const { goalId, ...rest } = goalContributeEnvelope.parse(payload);
      return goals.contribute(userId, goalId, createContributionSchema.parse(rest));
    },

    'debt.create': (userId, payload) => debts.create(userId, createDebtSchema.parse(payload)),
    'debt.update': async (userId, payload, baseVersion) => {
      const { id, ...rest } = entityRefSchema.parse(payload);
      await checkVersion(() => debts.getById(userId, id), baseVersion);
      return debts.update(userId, id, updateDebtSchema.parse(rest));
    },
    'debt.recordPayment': (userId, payload) => {
      const { debtId, ...rest } = debtRecordPaymentEnvelope.parse(payload);
      return debts.recordPayment(userId, debtId, recordPaymentSchema.parse(rest));
    },
    'debt.simulateEarlyRepayment': (userId, payload) => {
      const { debtId, ...rest } = debtSimulateEnvelope.parse(payload);
      return debts.simulateEarlyRepayment(userId, debtId, simulatePayoffSchema.parse(rest));
    },

    'recurrence.create': (userId, payload) => recurrence.create(userId, createRecurrenceSchema.parse(payload)),
    'recurrence.update': async (userId, payload, baseVersion) => {
      const { id, ...rest } = entityRefSchema.parse(payload);
      await checkVersion(() => recurrence.getById(userId, id), baseVersion);
      return recurrence.update(userId, id, updateRecurrenceSchema.parse(rest));
    },
    'recurrence.delete': async (userId, payload, baseVersion) => {
      const { id } = entityRefSchema.parse(payload);
      await checkVersion(() => recurrence.getById(userId, id), baseVersion);
      await recurrence.remove(userId, id);
      return { id };
    },
    'recurrence.skipOccurrence': async (userId, payload, baseVersion) => {
      const { id, occurrenceDate } = recurrenceSkipSchema.parse(payload);
      await checkVersion(() => recurrence.getById(userId, id), baseVersion);
      return recurrence.skipOccurrence(userId, id, occurrenceDate);
    },

    'notification.markRead': async (userId, payload) => {
      const { id } = notificationMarkReadSchema.parse(payload);
      await notifications.markRead(userId, id);
      return { id };
    },
  };
}
