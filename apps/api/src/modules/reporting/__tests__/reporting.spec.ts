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
import { BudgetsService } from '../../budgets/budgets.service';
import { BudgetsFacade } from '../../budgets/budgets.facade';
import { ReportingService } from '../reporting.service';

function buildReportingService(prisma: PrismaService) {
  const accountsService = new AccountsService(prisma);
  const accountsFacade = new AccountsFacade(accountsService);
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const events = new EventEmitter2();
  const transactionsService = new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, events);
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
});
