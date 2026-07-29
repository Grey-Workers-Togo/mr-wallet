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
import { TransactionsFacade } from '../../transactions/transactions.facade';
import { GoalsService } from '../goals.service';

function buildGoalsService(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const events = new EventEmitter2();
  const transactionsService = new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, events);
  const transactionsFacade = new TransactionsFacade(transactionsService);
  return { service: new GoalsService(prisma, accountsFacade, transactionsFacade, events), accountsService: new AccountsService(prisma), events };
}

describe('goals', () => {
  const prisma = new PrismaService();
  const { service, accountsService, events } = buildGoalsService(prisma);

  let userA: string;
  let userB: string;
  let checkingId: string;
  let savingsId: string;
  let goalOfB: string;
  let goalReachedEvents: unknown[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    events.on('goal.reached', (payload) => goalReachedEvents.push(payload));

    const a = await prisma.user.create({ data: { email: `goal-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    const b = await prisma.user.create({ data: { email: `goal-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userA = a.id;
    userB = b.id;

    const checking = await accountsService.create(userB, {
      name: 'Checking',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '500000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    checkingId = checking.id;
    const savings = await accountsService.create(userB, {
      name: 'Savings',
      type: 'SAVINGS',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    savingsId = savings.id;

    const goal = await service.create(userB, {
      name: 'Emergency fund',
      targetMinor: '10000',
      currency: 'EUR',
      linkedAccountId: savingsId,
      priority: 0,
    });
    goalOfB = goal.id;
  });

  afterAll(async () => {
    await prisma.goalContribution.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.savingsGoal.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('user A cannot read user B goal', async () => {
    await expect(service.getById(userA, goalOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('RG-G1: a manual contribution (no transfer) recomputes currentMinor', async () => {
    await service.addContribution(userB, goalOfB, { amountMinor: '4000', contributedAt: new Date('2026-02-01') });
    const goal = await service.getById(userB, goalOfB);
    expect(goal.currentMinor).toBe(4000n);
  });

  it('RG-G5: a contribution with fromAccountId creates a real transfer transaction', async () => {
    const contribution = await service.addContribution(userB, goalOfB, {
      amountMinor: '3000',
      contributedAt: new Date('2026-02-02'),
      fromAccountId: checkingId,
    });
    expect(contribution.transactionId).not.toBeNull();

    const transaction = await prisma.transaction.findUnique({ where: { id: contribution.transactionId as string } });
    expect(transaction?.transferGroupId).not.toBeNull();
    expect(transaction?.accountId).toBe(savingsId);

    const goal = await service.getById(userB, goalOfB);
    expect(goal.currentMinor).toBe(7000n);
  });

  it('RG-G4: reaching the target completes the goal and emits goal.reached exactly once', async () => {
    goalReachedEvents = [];
    await service.addContribution(userB, goalOfB, { amountMinor: '3000', contributedAt: new Date('2026-02-03') });
    const goal = await service.getById(userB, goalOfB);
    expect(goal.status).toBe('COMPLETED');
    expect(goal.currentMinor).toBe(10000n);
    expect(goalReachedEvents).toHaveLength(1);

    // RG-G4: a further contribution beyond target is accepted, not rejected, and doesn't re-fire the event.
    await service.addContribution(userB, goalOfB, { amountMinor: '500', contributedAt: new Date('2026-02-04') });
    const overshoot = await service.getById(userB, goalOfB);
    expect(overshoot.currentMinor).toBe(10500n);
    expect(overshoot.status).toBe('COMPLETED');
    expect(goalReachedEvents).toHaveLength(1);
  });

  it('RG-G3: progress reports the required monthly amount toward a future target date', async () => {
    const goal = await service.create(userB, {
      name: 'Vacation',
      targetMinor: '90000',
      currency: 'EUR',
      priority: 0,
      targetDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 3, 1)),
    });
    const progress = await service.progress(userB, goal.id);
    expect(progress.monthsRemaining).toBe(3);
    expect(progress.requiredMonthlyMinor).toBe('30000');
    expect(progress.isOverdue).toBe(false);
  });
});
