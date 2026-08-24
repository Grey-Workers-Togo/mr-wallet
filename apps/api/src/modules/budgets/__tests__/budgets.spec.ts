import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../../common/errors/app-error';
import { AccountsService } from '../../accounts/accounts.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { CategoriesService } from '../../categories/categories.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { RulesService } from '../../rules/rules.service';
import { RulesFacade } from '../../rules/rules.facade';
import { TransactionsService } from '../../transactions/transactions.service';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { BudgetsService } from '../budgets.service';

describe('budgets', () => {
  const prisma = new PrismaService();
  const accountsService = new AccountsService(prisma);
  const accountsFacade = new AccountsFacade(accountsService);
  const categoriesService = new CategoriesService(prisma);
  const categoriesFacade = new CategoriesFacade(categoriesService);
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const events = new EventEmitter2();
  const transactionsService = new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, events, new SavedSearchesService(prisma));
  const budgetsService = new BudgetsService(prisma, categoriesFacade, events);
  events.on('transaction.created', (payload) => budgetsService.onTransactionCreated(payload));
  events.on('transaction.updated', (payload) => budgetsService.onTransactionUpdated(payload));
  events.on('transaction.deleted', (payload) => budgetsService.onTransactionDeleted(payload));

  let userA: string;
  let userB: string;
  let accountId: string;
  let categoryId: string;
  let budgetOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `bud-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR', monthStartDay: 1 } });
    const b = await prisma.user.create({ data: { email: `bud-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR', monthStartDay: 1 } });
    userA = a.id;
    userB = b.id;

    const account = await accountsService.create(userB, {
      name: 'Main',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '1000000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;

    const category = await categoriesService.create(userB, { name: 'Food', kind: 'EXPENSE' });
    categoryId = category.id;

    const budget = await budgetsService.create(userB, {
      name: 'Food budget',
      categoryId,
      amountMinor: '10000',
      currency: 'EUR',
      period: 'MONTHLY',
      startsOn: new Date('2026-01-01'),
      rollover: false,
      alertThresholds: [80, 100],
    });
    budgetOfB = budget.id;
  });

  afterAll(async () => {
    await prisma.budgetPeriod.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.budget.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.category.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('user A cannot read user B budget', async () => {
    await expect(budgetsService.getById(userA, budgetOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('RG-B8: 12 rolling monthly periods are materialized on creation', async () => {
    const periods = await budgetsService.periods(userB, budgetOfB);
    expect(periods.length).toBeGreaterThanOrEqual(12);
  });

  it('RG-B4: a second active budget on the same category and overlapping period is rejected', async () => {
    await expect(
      budgetsService.create(userB, {
        name: 'Duplicate',
        categoryId,
        amountMinor: '5000',
        currency: 'EUR',
        period: 'MONTHLY',
        startsOn: new Date('2026-02-01'),
        rollover: false,
        alertThresholds: [80, 100],
      }),
    ).rejects.toThrow();
  });

  it('RG-B3: an EXPENSE transaction in the category increments spentMinor for its period', async () => {
    await transactionsService.create(userB, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '4000',
      occurredAt: new Date('2026-01-15'),
      description: 'Groceries',
      categoryId,
      status: 'CLEARED',
      tagIds: [],
    });

    const periods = await budgetsService.periods(userB, budgetOfB);
    const january = periods.find((p) => p.periodStart.getUTCMonth() === 0);
    expect(january?.spentMinor).toBe(4000n);
  });

  it('RG-B6: crossing the same threshold twice only records one alert', async () => {
    await transactionsService.create(userB, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '4500', // total 8500/10000 = 85% > 80% threshold
      occurredAt: new Date('2026-01-16'),
      description: 'More groceries',
      categoryId,
      status: 'CLEARED',
      tagIds: [],
    });
    const periods = await budgetsService.periods(userB, budgetOfB);
    const january = periods.find((p) => p.periodStart.getUTCMonth() === 0);
    expect(january?.lastAlertPct).toBe(80);

    // A second, smaller expense that stays under the next threshold must not change lastAlertPct.
    await transactionsService.create(userB, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '100',
      occurredAt: new Date('2026-01-17'),
      description: 'Small',
      categoryId,
      status: 'CLEARED',
      tagIds: [],
    });
    const after = await budgetsService.periods(userB, budgetOfB);
    const januaryAfter = after.find((p) => p.periodStart.getUTCMonth() === 0);
    expect(januaryAfter?.lastAlertPct).toBe(80);
  });
});
