import { describe, expect, it } from 'vitest';
import { OPERATION_NAMES } from '@budget-manager/sync-protocol';
import { buildDispatchTable } from '../domain/dispatch';
import type { AccountsFacade } from '../../accounts/accounts.facade';
import type { TransactionsFacade } from '../../transactions/transactions.facade';
import type { CategoriesFacade } from '../../categories/categories.facade';
import type { TagsFacade } from '../../tags/tags.facade';
import type { BudgetsFacade } from '../../budgets/budgets.facade';
import type { GoalsFacade } from '../../goals/goals.facade';
import type { DebtsFacade } from '../../debts/debts.facade';
import type { RecurrenceFacade } from '../../recurrence/recurrence.facade';
import type { NotificationsFacade } from '../../notifications/notifications.facade';

/**
 * RG-SY5: adding an op to the catalogue requires handling on the API side in the same commit.
 * This is the guard that catches drift — no facade calls happen here, just table shape.
 */
describe('sync dispatch table completeness', () => {
  it('has exactly one handler per catalogued operation, no more, no less', () => {
    const table = buildDispatchTable({
      accounts: {} as AccountsFacade,
      transactions: {} as TransactionsFacade,
      categories: {} as CategoriesFacade,
      tags: {} as TagsFacade,
      budgets: {} as BudgetsFacade,
      goals: {} as GoalsFacade,
      debts: {} as DebtsFacade,
      recurrence: {} as RecurrenceFacade,
      notifications: {} as NotificationsFacade,
    });

    const tableKeys = Object.keys(table).sort();
    const catalogueKeys = [...OPERATION_NAMES].sort();
    expect(tableKeys).toEqual(catalogueKeys);
  });
});
