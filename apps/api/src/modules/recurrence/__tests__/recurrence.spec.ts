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
import { RecurrenceService } from '../recurrence.service';

function buildRecurrenceService(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const transactionsService = new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, new EventEmitter2());
  const transactionsFacade = new TransactionsFacade(transactionsService);
  return { service: new RecurrenceService(prisma, transactionsFacade), accountsService: new AccountsService(prisma) };
}

describe('recurrence', () => {
  const prisma = new PrismaService();
  const { service, accountsService } = buildRecurrenceService(prisma);

  let userA: string;
  let userB: string;
  let accountId: string;
  let ruleOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `rec-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    const b = await prisma.user.create({ data: { email: `rec-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userA = a.id;
    userB = b.id;

    const account = await accountsService.create(userB, {
      name: 'Main',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '10000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;

    const rule = await service.create(userB, {
      name: 'Rent',
      type: 'EXPENSE',
      accountId,
      amountMinor: '50000',
      currency: 'EUR',
      amountIsEstimate: false,
      frequency: 'MONTHLY',
      interval: 1,
      startsOn: new Date('2026-01-31'),
      autoCreate: false,
      reminderDaysBefore: 3,
    });
    ruleOfB = rule.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.recurrenceRule.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('user A cannot read user B recurrence rule', async () => {
    await expect(service.getById(userA, ruleOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('RG-R3: autoCreate=false does not materialize anything by itself', async () => {
    const transactions = await prisma.transaction.findMany({ where: { userId: userB, recurrenceId: ruleOfB } });
    expect(transactions).toHaveLength(0);
  });

  it('materialize creates a transaction tagged with the recurrence, and refuses a duplicate occurrence', async () => {
    const occurrenceDate = new Date('2026-01-31');
    const transaction = await service.materialize(userB, ruleOfB, occurrenceDate);
    expect(transaction.recurrenceId).toBe(ruleOfB);

    await expect(service.materialize(userB, ruleOfB, occurrenceDate)).rejects.toThrow();
  });

  it('RG-R5: updating the rule does not touch the already-created transaction amount', async () => {
    await service.update(userB, ruleOfB, { amountMinor: '99999' });
    const transaction = await prisma.transaction.findFirst({ where: { userId: userB, recurrenceId: ruleOfB } });
    expect(transaction?.amountMinor).toBe(50000n);
  });

  it('RG-R6: a skipped occurrence is excluded from the computed list', async () => {
    const before = await service.occurrences(userB, ruleOfB, new Date('2026-04-01'));
    await service.skip(userB, ruleOfB, (before[1] as (typeof before)[number]).occurrenceDate);
    const after = await service.occurrences(userB, ruleOfB, new Date('2026-04-01'));
    expect(after).toHaveLength(before.length - 1);
  });
});
