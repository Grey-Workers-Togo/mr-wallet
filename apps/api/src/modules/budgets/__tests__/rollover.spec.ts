import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { AccountsService } from '../../accounts/accounts.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { RulesFacade } from '../../rules/rules.facade';
import { RulesService } from '../../rules/rules.service';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { BudgetsService } from '../budgets.service';

/**
 * RG-B5: `allocated(n) = amount + (allocated(n-1) − spent(n-1))`, whatever the order in which the periods
 * were materialized and the spending arrived. The periods are materialized ahead of time, so a stored
 * allocation is only right if every change of spending, or of the budget, is carried to the periods after it.
 */
describe('RG-B5: rollover cascades through the materialized periods', () => {
  const prisma = new PrismaService();
  const categoriesService = new CategoriesService(prisma);
  const categoriesFacade = new CategoriesFacade(categoriesService);
  const accountsService = new AccountsService(prisma);
  const events = new EventEmitter2();
  // The 30th of September: the horizon of the materialization is September of the year after. Only `Date` is
  // frozen, the timers stay real for the database driver.
  const transactions = new TransactionsService(
    prisma,
    new AccountsFacade(accountsService),
    categoriesFacade,
    new RulesFacade(new RulesService(prisma)),
    events,
    new SavedSearchesService(prisma),
  );
  const budgets = new BudgetsService(prisma, categoriesFacade, events);
  events.on('transaction.created', (payload) => budgets.onTransactionCreated(payload));
  events.on('transaction.updated', (payload) => budgets.onTransactionUpdated(payload));
  events.on('transaction.deleted', (payload) => budgets.onTransactionDeleted(payload));

  let userId: string;
  let accountId: string;
  let sequence = 0;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-30T12:00:00Z') });
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `rollover-${randomUUID()}@example.com`, passwordHash: 'x', baseCurrency: 'XOF', monthStartDay: 1 },
    });
    userId = user.id;
    accountId = (
      await accountsService.create(userId, {
        name: 'Main',
        type: 'BANK',
        currency: 'XOF',
        openingBalanceMinor: '10000000',
        openingBalanceAt: new Date('2026-01-01'),
        includeInNetWorth: true,
      })
    ).id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await prisma.budgetPeriod.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function newCategory(): Promise<string> {
    sequence += 1;
    return (await categoriesService.create(userId, { name: `Rollover ${sequence}`, kind: 'EXPENSE' })).id;
  }

  const spend = (categoryId: string, at: string, amountMinor: string) =>
    transactions.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor,
      occurredAt: new Date(at),
      description: 'spend',
      categoryId,
      status: 'CLEARED',
      tagIds: [],
    });

  const createBudget = (categoryId: string, amountMinor: string, rollover: boolean, startsOn = '2026-06-01') =>
    budgets.create(userId, {
      name: `Budget ${categoryId.slice(0, 8)}`,
      categoryId,
      amountMinor,
      currency: 'XOF',
      period: 'MONTHLY',
      startsOn: new Date(startsOn),
      rollover,
      alertThresholds: [80, 100],
    });

  /** The rule, written down independently of the service: from the base amount and what was spent. */
  function ruleAllocations(base: bigint, spent: bigint[]): bigint[] {
    const allocated: bigint[] = [];
    spent.forEach((value, index) => {
      const previous = index === 0 ? undefined : allocated[index - 1]! - spent[index - 1]!;
      allocated.push(base + (previous ?? 0n));
      void value;
    });
    return allocated;
  }

  async function stored(budgetId: string) {
    return prisma.budgetPeriod.findMany({ where: { budgetId }, orderBy: { periodStart: 'asc' } });
  }

  /** Every materialized period obeys the rule, recomputed from the spending the periods themselves record. */
  async function expectRule(budgetId: string, base: bigint) {
    const periods = await stored(budgetId);
    expect(periods.length).toBeGreaterThan(12);
    const expected = ruleAllocations(base, periods.map((p) => p.spentMinor));
    expect(periods.map((p) => p.allocatedMinor)).toEqual(expected);
    periods.forEach((p, i) => {
      expect(p.rolloverInMinor).toBe(i === 0 ? 0n : periods[i - 1]!.allocatedMinor - periods[i - 1]!.spentMinor);
    });
    return periods;
  }

  const month = (periods: Awaited<ReturnType<typeof stored>>, ym: string) =>
    periods.find((p) => p.periodStart.toISOString().startsWith(ym))!;

  it('carries what is spent to every period after it, the future ones included', async () => {
    const categoryId = await newCategory();
    const budget = await createBudget(categoryId, '71000', true);

    await spend(categoryId, '2026-06-10T00:00:00Z', '50000');
    await spend(categoryId, '2026-07-10T00:00:00Z', '80000'); // overspent: the carry out is 92000 - 80000

    const periods = await expectRule(budget.id, 71000n);
    expect(month(periods, '2026-06').allocatedMinor).toBe(71000n);
    expect(month(periods, '2026-07').allocatedMinor).toBe(92000n);
    expect(month(periods, '2026-08').allocatedMinor).toBe(83000n);
    expect(month(periods, '2026-09').allocatedMinor).toBe(154000n);
    // Nothing is spent after September: the carry only grows by the base amount, it never compounds.
    expect(month(periods, '2027-09').allocatedMinor).toBe(154000n + 71000n * 12n);
  });

  it('gives the carry back when a transaction is deleted, moved or its amount changed', async () => {
    const categoryId = await newCategory();
    const budget = await createBudget(categoryId, '71000', true);
    const first = await spend(categoryId, '2026-06-10T00:00:00Z', '50000');
    const second = await spend(categoryId, '2026-07-10T00:00:00Z', '20000');
    await expectRule(budget.id, 71000n);

    await transactions.update(userId, second.id, { amountMinor: '60000' });
    let periods = await expectRule(budget.id, 71000n);
    expect(month(periods, '2026-08').allocatedMinor).toBe(71000n + (71000n + 21000n - 60000n));

    await transactions.update(userId, second.id, { occurredAt: new Date('2026-06-20T00:00:00Z') });
    periods = await expectRule(budget.id, 71000n);
    expect(month(periods, '2026-07').allocatedMinor).toBe(71000n + (71000n - 110000n));

    await transactions.remove(userId, first.id);
    periods = await expectRule(budget.id, 71000n);
    expect(month(periods, '2026-07').allocatedMinor).toBe(71000n + (71000n - 60000n));
  });

  it('a budget created over spending that already exists starts with its true figures', async () => {
    const categoryId = await newCategory();
    await spend(categoryId, '2026-06-05T00:00:00Z', '30000');
    await spend(categoryId, '2026-08-05T00:00:00Z', '10000');

    const budget = await createBudget(categoryId, '71000', true);

    const periods = await expectRule(budget.id, 71000n);
    expect(month(periods, '2026-06').spentMinor).toBe(30000n);
    expect(month(periods, '2026-07').allocatedMinor).toBe(112000n);
    expect(month(periods, '2026-08').allocatedMinor).toBe(183000n);
    expect(month(periods, '2026-09').allocatedMinor).toBe(244000n);
  });

  it('follows a change of the base amount, and of the rollover itself', async () => {
    const categoryId = await newCategory();
    const budget = await createBudget(categoryId, '71000', true);
    await spend(categoryId, '2026-06-10T00:00:00Z', '50000');

    await budgets.update(userId, budget.id, { amountMinor: '60000' });
    let periods = await expectRule(budget.id, 60000n);
    expect(month(periods, '2026-07').allocatedMinor).toBe(70000n);

    await budgets.update(userId, budget.id, { rollover: false });
    periods = await stored(budget.id);
    expect(periods.every((p) => p.allocatedMinor === 60000n && p.rolloverInMinor === 0n)).toBe(true);

    await budgets.update(userId, budget.id, { rollover: true });
    periods = await expectRule(budget.id, 60000n);
    expect(month(periods, '2026-07').allocatedMinor).toBe(70000n);
  });

  it('extends the horizon from the corrected last period', async () => {
    const categoryId = await newCategory();
    const budget = await createBudget(categoryId, '71000', true);
    await spend(categoryId, '2026-09-10T00:00:00Z', '40000');

    vi.setSystemTime(new Date('2026-12-31T12:00:00Z'));
    await budgets.generatePeriods(budget.id, 1);

    const periods = await expectRule(budget.id, 71000n);
    expect(periods[periods.length - 1]!.periodStart.toISOString()).toBe('2027-12-01T00:00:00.000Z');
  });

  it('leaves a budget without rollover at its base amount', async () => {
    const categoryId = await newCategory();
    const budget = await createBudget(categoryId, '71000', false);
    await spend(categoryId, '2026-06-10T00:00:00Z', '50000');

    const periods = await stored(budget.id);
    expect(periods.every((p) => p.allocatedMinor === 71000n && p.rolloverInMinor === 0n)).toBe(true);
    expect(month(periods, '2026-06').spentMinor).toBe(50000n);
  });
});
