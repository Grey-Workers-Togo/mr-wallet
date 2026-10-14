import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, RawPrismaService } from '../../../common/prisma/prisma.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { AccountsService } from '../../accounts/accounts.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { RulesFacade } from '../../rules/rules.facade';
import { RulesService } from '../../rules/rules.service';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { TransactionsService } from '../../transactions/transactions.service';
import { BudgetsService } from '../budgets.service';
import { repairBudgetPeriods } from '../../../../scripts/repair-budget-periods';

/**
 * The repair script brings stored periods back to what RG-B5 gives, once, without announcing the past.
 * The corrupted state is written directly: it is what the defect left in the database.
 */
describe('repair-budget-periods', () => {
  const prisma = new PrismaService();
  const raw = new RawPrismaService();
  const categoriesService = new CategoriesService(prisma);
  const categoriesFacade = new CategoriesFacade(categoriesService);
  const accountsService = new AccountsService(prisma);
  const events = new EventEmitter2();
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

  const alerts: unknown[] = [];
  events.on('budget.threshold_crossed', (payload) => alerts.push(payload));

  let userId: string;
  let otherUserId: string;
  let accountId: string;
  let categoryId: string;
  let budgetId: string;
  let otherBudgetId: string;

  // The first of the month, three months back: all the spending below is in the past, whatever today is.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  monthStart.setUTCMonth(monthStart.getUTCMonth() - 3);
  const at = (monthsAfter: number, day: number) =>
    new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + monthsAfter, day));

  const stored = () => raw.budgetPeriod.findMany({ where: { budgetId }, orderBy: { periodStart: 'asc' } });

  beforeAll(async () => {
    await prisma.$connect();
    const make = (label: string) =>
      prisma.user.create({
        data: { email: `repair-${label}-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'XOF', monthStartDay: 1 },
      });
    userId = (await make('a')).id;
    otherUserId = (await make('b')).id;
    accountId = (
      await accountsService.create(userId, {
        name: 'Main',
        type: 'BANK',
        currency: 'XOF',
        openingBalanceMinor: '10000000',
        openingBalanceAt: new Date('2020-01-01'),
        includeInNetWorth: true,
      })
    ).id;
    categoryId = (await categoriesService.create(userId, { name: 'Repair', kind: 'EXPENSE' })).id;

    const dto = (name: string, category: string) => ({
      name,
      categoryId: category,
      amountMinor: '71000',
      currency: 'XOF',
      period: 'MONTHLY' as const,
      startsOn: monthStart,
      rollover: true,
      alertThresholds: [80, 100],
    });
    budgetId = (await budgets.create(userId, dto('Repair', categoryId))).id;

    // A second user with a budget that is already right: the repair must leave it alone.
    const otherCategory = (await categoriesService.create(otherUserId, { name: 'Other', kind: 'EXPENSE' })).id;
    otherBudgetId = (await budgets.create(otherUserId, dto('Other', otherCategory))).id;

    const spend = (amountMinor: string, occurredAt: Date) =>
      transactions.create(userId, {
        accountId,
        type: 'EXPENSE',
        amountMinor,
        occurredAt,
        description: 'spend',
        categoryId,
        status: 'CLEARED',
        tagIds: [],
      });
    await spend('80000', at(0, 10)); // 112.7 % of the first allocation
    await spend('20000', at(1, 10));

    // What the defect left: the allocations compounded, the spending of the created periods at zero.
    const periods = await stored();
    for (const [index, period] of periods.entries()) {
      await raw.budgetPeriod.update({
        where: { id: period.id },
        data: { allocatedMinor: 71000n * BigInt(index + 1), rolloverInMinor: 71000n * BigInt(index), spentMinor: 0n, lastAlertPct: null },
      });
    }
  });

  afterAll(async () => {
    await raw.auditLog.deleteMany({ where: { userId: { in: [userId, otherUserId] } } }).catch(() => undefined);
    await raw.budgetPeriod.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await raw.budget.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await raw.transaction.deleteMany({ where: { userId } });
    await raw.category.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await raw.account.deleteMany({ where: { userId } });
    await raw.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  it('simulates by default: reports, writes nothing, shows no amount per user', async () => {
    const before = await stored();
    const report = await repairBudgetPeriods(raw, { apply: false, onlyUserIds: [userId, otherUserId] });

    expect(report.mode).toBe('dry-run');
    expect(report.users).toBe(1);
    expect(report.budgets).toBe(1);
    expect(report.periods).toBe(before.length);
    expect(report.byCurrency.XOF!.allocatedGapMinor).toBeGreaterThan(0n);
    expect(Object.keys(report)).not.toContain('perUser');
    expect(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(userId);
    expect(await stored()).toEqual(before);
    expect(await raw.auditLog.count({ where: { action: 'budget_period.repair', userId } })).toBe(0);
  });

  it('applies the rule, writes one SYSTEM audit entry per changed period, announces nothing', async () => {
    alerts.length = 0;
    const report = await repairBudgetPeriods(raw, { apply: true, onlyUserIds: [userId, otherUserId] });
    expect(report.mode).toBe('apply');
    expect(report.budgets).toBe(1);

    const periods = await stored();
    expect(periods[0]!.spentMinor).toBe(80000n);
    expect(periods[1]!.allocatedMinor).toBe(71000n + (71000n - 80000n));
    expect(periods[1]!.rolloverInMinor).toBe(-9000n);
    expect(periods[2]!.allocatedMinor).toBe(71000n + (62000n - 20000n));
    expect(periods[periods.length - 1]!.allocatedMinor).toBe(42000n + 71000n * BigInt(periods.length - 2));

    const audit = await raw.auditLog.findMany({ where: { action: 'budget_period.repair', userId } });
    expect(audit.length).toBe(report.periods);
    expect(audit.every((entry) => entry.actorType === 'SYSTEM' && entry.entityType === 'BudgetPeriod')).toBe(true);
    const first = audit.find((entry) => entry.entityId === periods[0]!.id)!;
    expect(first.after).toMatchObject({ spentMinor: '80000' });
    expect(await raw.auditLog.count({ where: { action: 'budget_period.repair', userId: otherUserId } })).toBe(0);

    // The first period is over 100 %: it is recorded as announced, and nothing was emitted.
    expect(periods[0]!.lastAlertPct).toBe(100);
    expect(alerts).toEqual([]);
  });

  it('does not announce a past overshoot when the next transaction arrives', async () => {
    alerts.length = 0;
    await transactions.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '1000',
      occurredAt: at(0, 20),
      description: 'late',
      categoryId,
      status: 'CLEARED',
      tagIds: [],
    });
    expect(alerts).toEqual([]);
  });

  it('is idempotent: a second run changes nothing and audits nothing', async () => {
    const before = await stored();
    const auditBefore = await raw.auditLog.count({ where: { action: 'budget_period.repair', userId } });

    const report = await repairBudgetPeriods(raw, { apply: true, onlyUserIds: [userId, otherUserId] });

    expect(report).toMatchObject({ budgets: 0, periods: 0, users: 0 });
    expect(await stored()).toEqual(before);
    expect(await raw.auditLog.count({ where: { action: 'budget_period.repair', userId } })).toBe(auditBefore);
    expect(otherBudgetId).toBeTruthy();
  });
});
