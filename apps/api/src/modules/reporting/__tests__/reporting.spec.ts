import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AccountsService } from '../../accounts/accounts.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { CategoriesService } from '../../categories/categories.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { RulesService } from '../../rules/rules.service';
import { RulesFacade } from '../../rules/rules.facade';
import { TransactionsService } from '../../transactions/transactions.service';
import { CurrencyService } from '../../currency/currency.service';
import { CurrencyFacade } from '../../currency/currency.facade';
import { DebtsService } from '../../debts/debts.service';
import { DebtsFacade } from '../../debts/debts.facade';
import { TransactionsFacade } from '../../transactions/transactions.facade';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { BudgetsFacade } from '../../budgets/budgets.facade';
import { ReportingService } from '../reporting.service';

function buildReportingService(prisma: PrismaService) {
  const accountsService = new AccountsService(prisma);
  const accountsFacade = new AccountsFacade(accountsService);
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const events = new EventEmitter2();
  const transactionsService = new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, events, new SavedSearchesService(prisma));
  const transactionsFacade = new TransactionsFacade(transactionsService);
  const currencyFacade = new CurrencyFacade(new CurrencyService(prisma));
  const debtsFacade = new DebtsFacade(new DebtsService(prisma, accountsFacade, transactionsFacade, events));
  const budgetsFacade = new BudgetsFacade(new BudgetsService(prisma, categoriesFacade, events));
  return {
    service: new ReportingService(prisma, accountsFacade, debtsFacade, currencyFacade, budgetsFacade),
    accountsService,
    transactionsService,
  };
}

describe('reporting', () => {
  const prisma = new PrismaService();
  const { service, accountsService, transactionsService } = buildReportingService(prisma);

  let userA: string;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `rep-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userA = a.id;

    const account = await accountsService.create(userA, {
      name: 'Main',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '100000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;

    const category = await prisma.category.create({ data: { userId: userA, name: 'Food', kind: 'EXPENSE' } });
    categoryId = category.id;

    await transactionsService.create(userA, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '5000',
      occurredAt: new Date('2026-01-10'),
      description: 'Groceries',
      categoryId,
      status: 'CLEARED',
      tagIds: [],
    });
    await transactionsService.create(userA, {
      accountId,
      type: 'INCOME',
      amountMinor: '20000',
      occurredAt: new Date('2026-01-05'),
      description: 'Salary',
      status: 'CLEARED',
      tagIds: [],
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: userA } });
    await prisma.category.deleteMany({ where: { userId: userA } });
    await prisma.account.deleteMany({ where: { userId: userA } });
    await prisma.user.deleteMany({ where: { id: userA } });
    await prisma.$disconnect();
  });

  it('RG-RP1: spending by category is aggregated in SQL and sums to the total', async () => {
    const report = await service.spendingByCategory(userA, {});
    expect(report.totalMinor).toBe('5000');
    const food = report.items.find((i) => i.categoryId === categoryId);
    expect(food?.totalMinor).toBe('5000');
    expect(food?.pct).toBe(100);
  });

  it('RG-RP3/RG-RP4: net worth is reconstructed from live account balances, not a stored snapshot', async () => {
    const netWorth = await service.netWorth(userA);
    // opening 100000 + income 20000 - expense 5000 = 115000, no debts.
    expect(netWorth.netWorthMinor).toBe('115000');
  });

  it('monthly summary reports income/expense for the transactions month', async () => {
    const summary = await service.monthlySummary(userA, { months: 24 });
    const january = summary.months.find((m) => m.month === '2026-01');
    expect(january?.incomeMinor).toBe('20000');
    expect(january?.expenseMinor).toBe('5000');
  });

  it('top transactions returns the largest expense first', async () => {
    const top = await service.topTransactions(userA, { limit: 10 });
    expect(top[0]?.amountMinor).toBe(5000n);
  });

  it('RG-A10 (lot 19): a reconciliation adjustment is excluded from the category breakdown, shown as unaccountedMinor', async () => {
    await transactionsService.create(
      userA,
      {
        accountId,
        type: 'EXPENSE',
        amountMinor: '750',
        occurredAt: new Date('2026-01-15'),
        description: 'Reconciliation adjustment',
        status: 'RECONCILED',
        tagIds: [],
      },
      { source: 'ADJUSTMENT' },
    );

    const report = await service.spendingByCategory(userA, {});
    expect(report.unaccountedMinor).toBe('750');
    expect(report.totalMinor).toBe('5000'); // unchanged — the adjustment never joins the per-category items
    expect(report.items.every((i) => i.categoryId !== null)).toBe(true);
  });

  it('RG-A10: top transactions keeps an adjustment by default and drops it on request', async () => {
    const all = await service.topTransactions(userA, { limit: 10 });
    expect(all.some((t) => t.source === 'ADJUSTMENT')).toBe(true);

    const identified = await service.topTransactions(userA, { limit: 10 }, { excludeAdjustments: true });
    expect(identified.length).toBeGreaterThan(0);
    expect(identified.every((t) => t.source !== 'ADJUSTMENT')).toBe(true);
  });
});

describe('reporting — months follow the user timezone', () => {
  const prisma = new PrismaService();
  const { service, accountsService, transactionsService } = buildReportingService(prisma);
  const userIds: string[] = [];

  async function seedUser(timezone: string, occurrences: { at: string; amountMinor: string }[]) {
    const user = await prisma.user.create({
      data: { email: `rep-tz-${Date.now()}-${userIds.length}@example.com`, passwordHash: 'x', baseCurrency: 'XOF', timezone },
    });
    userIds.push(user.id);
    const account = await accountsService.create(user.id, {
      name: 'Main',
      type: 'CASH',
      currency: 'XOF',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    for (const occurrence of occurrences) {
      await transactionsService.create(user.id, {
        accountId: account.id,
        type: 'EXPENSE',
        amountMinor: occurrence.amountMinor,
        occurredAt: new Date(occurrence.at),
        description: 'x',
        status: 'CLEARED',
        tagIds: [],
      });
    }
    return user.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('buckets a transaction just after local midnight into the new month (UTC+1)', async () => {
    const userId = await seedUser('Africa/Porto-Novo', [
      { at: '2026-08-31T23:30:00Z', amountMinor: '300' }, // 1 Sep 00:30 local
      { at: '2026-09-15T12:00:00Z', amountMinor: '200' },
      { at: '2026-09-30T23:30:00Z', amountMinor: '1000' }, // 1 Oct 00:30 local
    ]);

    const report = await service.cashflow(userId, {
      from: new Date('2026-08-31T23:00:00Z'), // 1 Sep 00:00 local
      to: new Date('2026-10-31T22:59:59.999Z'),
    });

    const byMonth = Object.fromEntries(report.months.map((m) => [m.month, m.expenseMinor]));
    expect(byMonth).toEqual({ '2026-09': '500', '2026-10': '1000' });
  });

  it('keeps a late-evening transaction in the previous month for a user behind UTC', async () => {
    const userId = await seedUser('America/New_York', [
      { at: '2026-10-01T02:00:00Z', amountMinor: '700' }, // 30 Sep 22:00 local
    ]);

    const report = await service.cashflow(userId, {
      from: new Date('2026-09-01T04:00:00Z'),
      to: new Date('2026-10-01T03:59:59.999Z'),
    });

    expect(report.months).toEqual([{ month: '2026-09', incomeMinor: '0', expenseMinor: '700', netMinor: '-700' }]);
  });

  it('leaves the report working, bucketed by UTC, for a stored timezone that is not an IANA name', async () => {
    const userId = await seedUser('Mars/Olympus', [{ at: '2026-09-15T12:00:00Z', amountMinor: '200' }]);

    const report = await service.cashflow(userId, { from: new Date('2026-09-01'), to: new Date('2026-09-30') });

    expect(report.months).toEqual([{ month: '2026-09', incomeMinor: '0', expenseMinor: '200', netMinor: '-200' }]);
  });
});
