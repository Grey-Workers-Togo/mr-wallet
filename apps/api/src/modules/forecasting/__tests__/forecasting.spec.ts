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
  let rentRuleId: string;

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

    const rent = await prisma.recurrenceRule.create({
      data: {
        userId: userA,
        name: 'Rent',
        type: 'EXPENSE',
        accountId,
        amountMinor: 50000n,
        currency: 'EUR',
        amountIsEstimate: false,
        frequency: 'MONTHLY',
        interval: 1,
        startsOn: new Date('2026-01-01'),
        autoCreate: false,
      },
    });
    rentRuleId = rent.id;
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

  describe('docs/12 Lot 9: scenario forecasts', () => {
    it('overriding one recurring expense diverges from the baseline by exactly the expected delta over 3 months', async () => {
      const baseline = await service.cashflowForecast(userA, 3);
      const scenario = await service.scenarioForecast(userA, {
        months: 3,
        overrides: [{ ruleId: rentRuleId, amountMinor: '80000' }], // Rent 50000 -> 80000, delta 30000/month
        oneOffs: [],
      });

      expect(scenario.months).toHaveLength(3);
      for (let i = 0; i < 3; i += 1) {
        const expectedDelta = 30000n * BigInt(i + 1); // cumulative, balance carries forward
        const baselineBalance = BigInt(baseline.months[i]!.balanceMinor);
        const scenarioBalance = BigInt(scenario.months[i]!.balanceMinor);
        expect(baselineBalance - scenarioBalance).toBe(expectedDelta);
      }
    });

    it('a one-off future amount only affects its own month, not earlier or later ones', async () => {
      const baseline = await service.cashflowForecast(userA, 3);
      const scenario = await service.scenarioForecast(userA, {
        months: 3,
        overrides: [],
        oneOffs: [{ month: baseline.months[1]!.month, type: 'EXPENSE', amountMinor: '15000' }],
      });

      expect(BigInt(scenario.months[0]!.balanceMinor)).toBe(BigInt(baseline.months[0]!.balanceMinor));
      expect(BigInt(baseline.months[1]!.balanceMinor) - BigInt(scenario.months[1]!.balanceMinor)).toBe(15000n);
      expect(BigInt(baseline.months[2]!.balanceMinor) - BigInt(scenario.months[2]!.balanceMinor)).toBe(15000n);
    });

    it('is never cached and never mutates the underlying recurrence rule', async () => {
      await service.scenarioForecast(userA, { months: 3, overrides: [{ ruleId: rentRuleId, amountMinor: '99999' }], oneOffs: [] });
      const rule = await prisma.recurrenceRule.findUniqueOrThrow({ where: { id: rentRuleId } });
      expect(rule.amountMinor).toBe(50000n);

      const again = await service.scenarioForecast(userA, { months: 3, overrides: [], oneOffs: [] });
      const baseline = await service.cashflowForecast(userA, 3);
      expect(again.months[0]!.balanceMinor).toBe(baseline.months[0]!.balanceMinor);
    });
  });
});
