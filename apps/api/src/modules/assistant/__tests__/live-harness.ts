import { EventEmitter2 } from '@nestjs/event-emitter';
import { systemClock, type Clock } from '../../../common/clock/clock';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { AccountsService } from '../../accounts/accounts.service';
import { BudgetsFacade } from '../../budgets/budgets.facade';
import { BudgetsService } from '../../budgets/budgets.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { CurrencyFacade } from '../../currency/currency.facade';
import { CurrencyService } from '../../currency/currency.service';
import { DebtsFacade } from '../../debts/debts.facade';
import { DebtsService } from '../../debts/debts.service';
import { ForecastingFacade } from '../../forecasting/forecasting.facade';
import { ForecastingService } from '../../forecasting/forecasting.service';
import { GoalsFacade } from '../../goals/goals.facade';
import { GoalsService } from '../../goals/goals.service';
import { RecurrenceFacade } from '../../recurrence/recurrence.facade';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { ReportingFacade } from '../../reporting/reporting.facade';
import { ReportingService } from '../../reporting/reporting.service';
import { RulesFacade } from '../../rules/rules.facade';
import { RulesService } from '../../rules/rules.service';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { TransactionsFacade } from '../../transactions/transactions.facade';
import { TransactionsService } from '../../transactions/transactions.service';
import { UsersFacade } from '../../users/users.facade';
import { buildToolContext } from '../assistant.context';
import type { ToolFacades } from '../tools/catalogue';

/**
 * Real services over the test database, wired as in `AppModule`. Only the LLM is scripted. The clock is
 * the one `ClockModule` provides: the system's, or a frozen one for the tests that read "now".
 */
export function buildLive(prisma: PrismaService, clock: Clock = systemClock) {
  const accountsService = new AccountsService(prisma);
  const accounts = new AccountsFacade(accountsService);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const rules = new RulesFacade(new RulesService(prisma));
  const events = new EventEmitter2();
  const transactionsService = new TransactionsService(prisma, accounts, categories, rules, events, new SavedSearchesService(prisma), clock);
  const transactions = new TransactionsFacade(transactionsService);
  const currency = new CurrencyFacade(new CurrencyService(prisma));
  const debts = new DebtsFacade(new DebtsService(prisma, accounts, transactions, events));
  const budgets = new BudgetsFacade(new BudgetsService(prisma, categories, events, clock));
  const goals = new GoalsFacade(new GoalsService(prisma, accounts, transactions, events));
  const reporting = new ReportingFacade(new ReportingService(prisma, accounts, debts, currency, budgets, clock));
  const forecasting = new ForecastingFacade(
    new ForecastingService(
      new RecurrenceFacade(new RecurrenceService(prisma, transactions, clock)),
      debts,
      transactions,
      reporting,
      clock,
    ),
  );
  const users = new UsersFacade(prisma);

  const facades: ToolFacades = { reporting, accounts, budgets, goals, debts, forecasting };
  return {
    facades,
    users,
    categories,
    accountsService,
    transactionsService,
    toolContext: (userId: string, now: Date) => buildToolContext({ users, categories, accounts }, userId, now),
  };
}

export type Live = ReturnType<typeof buildLive>;

/** Fixed "now" for period resolution; data below sits in the month before and the month of it. */
export const NOW = new Date('2026-09-15T10:00:00Z');

export interface Dataset {
  userId: string;
  accountId: string;
  transportId: string;
  foodId: string;
  budgetId: string;
  goalId: string;
  /** Every internal identifier of the dataset: none may ever appear in another user's output. */
  ids: string[];
}

/**
 * One user with a small, distinctive month: amounts scale with `scale`, so a figure from another
 * user's dataset is recognisable. September 2026 (Porto-Novo, UTC+1) is the "current" month.
 */
export async function seedDataset(prisma: PrismaService, live: Live, tag: string, scale: bigint): Promise<Dataset> {
  const user = await prisma.user.create({
    data: {
      email: `assistant-${tag}-${Date.now()}@example.com`,
      passwordHash: 'x',
      baseCurrency: 'XOF',
      timezone: 'Africa/Porto-Novo',
      locale: 'fr-FR',
      // Has accepted the assistant (RG-AP8); the opt-in tests build their own user without it.
      assistantOptInAt: new Date('2026-09-01T00:00:00Z'),
    },
  });
  const userId = user.id;
  const account = await live.accountsService.create(userId, {
    name: `Flooz ${tag}`,
    type: 'MOBILE_MONEY',
    currency: 'XOF',
    openingBalanceMinor: (scale * 1_000_000n).toString(),
    openingBalanceAt: new Date('2026-01-01'),
    includeInNetWorth: true,
  });
  const transport = await prisma.category.create({ data: { userId, name: `Transport ${tag}`, kind: 'EXPENSE' } });
  const food = await prisma.category.create({ data: { userId, name: `Alimentation ${tag}`, kind: 'EXPENSE' } });

  const spend = (categoryId: string, amount: bigint, at: string, description: string) =>
    live.transactionsService.create(userId, {
      accountId: account.id,
      type: 'EXPENSE',
      amountMinor: (amount * scale).toString(),
      occurredAt: new Date(at),
      description,
      categoryId,
      status: 'CLEARED',
      tagIds: [],
    });

  // September 2026 (local)
  await spend(transport.id, 23_500n, '2026-09-03T08:00:00Z', `Taxi ${tag}`);
  await spend(food.id, 41_000n, '2026-09-05T12:00:00Z', `Marché ${tag}`);
  await spend(food.id, 9_000n, '2026-09-10T12:00:00Z', `Épicerie ${tag}`);
  await live.transactionsService.create(userId, {
    accountId: account.id,
    type: 'INCOME',
    amountMinor: (300_000n * scale).toString(),
    occurredAt: new Date('2026-09-01T09:00:00Z'),
    description: `Salaire ${tag}`,
    status: 'CLEARED',
    tagIds: [],
  });
  // August 2026 (local)
  await spend(transport.id, 12_000n, '2026-08-12T08:00:00Z', `Taxi août ${tag}`);
  await spend(food.id, 30_000n, '2026-08-20T12:00:00Z', `Marché août ${tag}`);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const budget = await prisma.budget.create({
    data: {
      userId,
      name: `Budget secret ${tag}`,
      categoryId: transport.id,
      amountMinor: 50_000n * scale,
      currency: 'XOF',
      period: 'MONTHLY',
      startsOn: monthStart,
    },
  });
  await prisma.budgetPeriod.create({
    data: {
      userId,
      budgetId: budget.id,
      periodStart: monthStart,
      periodEnd: nextMonth,
      allocatedMinor: 50_000n * scale,
      spentMinor: 20_000n * scale,
    },
  });
  const goal = await prisma.savingsGoal.create({
    data: {
      userId,
      name: `Objectif secret ${tag}`,
      targetMinor: 1_000_000n * scale,
      currentMinor: 250_000n * scale,
      currency: 'XOF',
      targetDate: new Date('2027-06-30T12:00:00Z'),
    },
  });
  await prisma.debt.create({
    data: {
      userId,
      name: `Dette secrète ${tag}`,
      direction: 'OWED_BY_ME',
      counterparty: `Contrepartie ${tag}`,
      principalMinor: 80_000n * scale,
      outstandingPrincipalMinor: 60_000n * scale,
      currency: 'XOF',
      startedOn: new Date('2026-06-01T00:00:00Z'),
    },
  });

  return {
    userId,
    accountId: account.id,
    transportId: transport.id,
    foodId: food.id,
    budgetId: budget.id,
    goalId: goal.id,
    ids: [userId, account.id, transport.id, food.id, budget.id, goal.id],
  };
}

export async function cleanup(prisma: PrismaService, userIds: string[]): Promise<void> {
  const where = { userId: { in: userIds } };
  await prisma.assistantUsage.deleteMany({ where });
  await prisma.debtInstallment.deleteMany({ where });
  await prisma.debtPayment.deleteMany({ where });
  await prisma.debt.deleteMany({ where });
  await prisma.goalContribution.deleteMany({ where });
  await prisma.savingsGoal.deleteMany({ where });
  await prisma.budgetPeriod.deleteMany({ where });
  await prisma.budget.deleteMany({ where });
  await prisma.transaction.deleteMany({ where });
  await prisma.category.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
