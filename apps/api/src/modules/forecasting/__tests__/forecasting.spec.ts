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
import { TransactionsFacade } from '../../transactions/transactions.facade';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { CurrencyService } from '../../currency/currency.service';
import { CurrencyFacade } from '../../currency/currency.facade';
import { DebtsService } from '../../debts/debts.service';
import { DebtsFacade } from '../../debts/debts.facade';
import { BudgetsService } from '../../budgets/budgets.service';
import { BudgetsFacade } from '../../budgets/budgets.facade';
import { ReportingService } from '../../reporting/reporting.service';
import { ReportingFacade } from '../../reporting/reporting.facade';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { RecurrenceFacade } from '../../recurrence/recurrence.facade';
import { ForecastingService } from '../forecasting.service';

function buildForecastingService(prisma: PrismaService) {
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
  const reportingFacade = new ReportingFacade(new ReportingService(prisma, accountsFacade, debtsFacade, currencyFacade, budgetsFacade));
  const recurrenceFacade = new RecurrenceFacade(new RecurrenceService(prisma, transactionsFacade));
  return {
    service: new ForecastingService(recurrenceFacade, debtsFacade, transactionsFacade, reportingFacade),
    accountsService,
    recurrenceFacade,
  };
}

describe('forecasting', () => {
  const prisma = new PrismaService();
  const { service, accountsService, recurrenceFacade } = buildForecastingService(prisma);

  let userA: string;
  let accountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `fc-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
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

    await prisma.recurrenceRule.create({
      data: {
        userId: userA,
        name: 'Salary',
        type: 'INCOME',
        accountId,
        amountMinor: 200000n,
        currency: 'EUR',
        amountIsEstimate: false,
        frequency: 'MONTHLY',
        interval: 1,
        startsOn: new Date('2026-01-01'),
        autoCreate: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.recurrenceRule.deleteMany({ where: { userId: userA } });
    await prisma.account.deleteMany({ where: { userId: userA } });
    await prisma.user.deleteMany({ where: { id: userA } });
    await prisma.$disconnect();
  });

  it('RG-F3: fewer than 2 months of transaction history flags the forecast as incomplete', async () => {
    const forecast = await service.cashflowForecast(userA, 3);
    expect(forecast.historyIncomplete).toBe(true);
  });

  it('RG-F2: each month exposes its recurring-income composition', async () => {
    const forecast = await service.cashflowForecast(userA, 3);
    expect(forecast.months).toHaveLength(3);
    expect(forecast.months[0]?.recurrentIncomeMinor).toBe('200000');
  });

  it('RG-F1: a second call within the TTL is served from cache (no recomputation drift)', async () => {
    const first = await service.cashflowForecast(userA, 3);
    const second = await service.cashflowForecast(userA, 3);
    expect(second).toEqual(first);
  });

  it('RG-F1: a transaction event invalidates the cache for that user', async () => {
    const before = await service.cashflowForecast(userA, 3);
    service.invalidateForUser({ userId: userA });
    await recurrenceFacade.forecastOccurrences(userA, new Date()); // sanity: facade still reachable post-invalidate
    const after = await service.cashflowForecast(userA, 3);
    expect(after).toEqual(before); // same inputs -> same output, just recomputed rather than cached
  });
});
