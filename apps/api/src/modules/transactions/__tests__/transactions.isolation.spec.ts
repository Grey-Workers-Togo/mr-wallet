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
import { TransactionsService } from '../transactions.service';
import { SavedSearchesService } from '../saved-searches.service';

function buildService(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  return new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, new EventEmitter2(), new SavedSearchesService(prisma));
}

describe('transactions isolation (userId scoping)', () => {
  const prisma = new PrismaService();
  const accountsService = new AccountsService(prisma);
  const service = buildService(prisma);

  let userA: string;
  let userB: string;
  let accountOfB: string;
  let transactionOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({
      data: { email: `tx-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    const b = await prisma.user.create({
      data: { email: `tx-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userA = a.id;
    userB = b.id;

    const account = await accountsService.create(userB, {
      name: "B's account",
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '10000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountOfB = account.id;

    const transaction = await service.create(userB, {
      accountId: accountOfB,
      type: 'EXPENSE',
      amountMinor: '1500',
      occurredAt: new Date('2026-02-01'),
      description: 'Lunch',
      status: 'CLEARED',
      tagIds: [],
    });
    transactionOfB = transaction.id;
  });

  afterAll(async () => {
    const ownedTransactions = await prisma.transaction.findMany({
      where: { userId: { in: [userA, userB] } },
      select: { id: true },
    });
    await prisma.transactionTag.deleteMany({ where: { transactionId: { in: ownedTransactions.map((t) => t.id) } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('user A cannot read user B transaction by id', async () => {
    await expect(service.getById(userA, transactionOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it("user A's list never includes user B's transactions", async () => {
    const page = await service.list(userA, { limit: 50 });
    expect(page.items.find((t) => t.id === transactionOfB)).toBeUndefined();
  });

  it('user A cannot update user B transaction', async () => {
    await expect(service.update(userA, transactionOfB, { description: 'hacked' })).rejects.toBeInstanceOf(
      NotFoundAppError,
    );
  });

  it('user A cannot delete user B transaction', async () => {
    await expect(service.remove(userA, transactionOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });
});

describe('transactions balance maintenance', () => {
  const prisma = new PrismaService();
  const accountsService = new AccountsService(prisma);
  const service = buildService(prisma);
  let userId: string;
  let accountId: string;
  let secondAccountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `tx-balance-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;

    const account = await accountsService.create(userId, {
      name: 'Main',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '100000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;

    const second = await accountsService.create(userId, {
      name: 'Savings',
      type: 'SAVINGS',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    secondAccountId = second.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('RG-T1: rejects a zero or negative amount', async () => {
    await expect(
      service.create(userId, {
        accountId,
        type: 'EXPENSE',
        amountMinor: '0',
        occurredAt: new Date('2026-02-01'),
        description: 'Zero',
        status: 'CLEARED',
        tagIds: [],
      }),
    ).rejects.toThrow();
  });

  it('EXPENSE decreases and INCOME increases the account balance', async () => {
    await service.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '2000',
      occurredAt: new Date('2026-02-01'),
      description: 'Groceries',
      status: 'CLEARED',
      tagIds: [],
    });
    await service.create(userId, {
      accountId,
      type: 'INCOME',
      amountMinor: '5000',
      occurredAt: new Date('2026-02-02'),
      description: 'Refund',
      status: 'CLEARED',
      tagIds: [],
    });

    const account = await accountsService.getById(userId, accountId);
    expect(account.currentBalanceMinor).toBe(100000n - 2000n + 5000n);
  });

  it('deleting a transaction reverses its balance effect', async () => {
    const created = await service.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '999',
      occurredAt: new Date('2026-02-03'),
      description: 'To be removed',
      status: 'CLEARED',
      tagIds: [],
    });
    const before = await accountsService.getById(userId, accountId);
    await service.remove(userId, created.id);
    const after = await accountsService.getById(userId, accountId);
    expect(after.currentBalanceMinor).toBe(before.currentBalanceMinor + 999n);
  });

  it('RG-T4: a transfer creates two legs and moves the exact amount between accounts', async () => {
    const before = await Promise.all([
      accountsService.getById(userId, accountId),
      accountsService.getById(userId, secondAccountId),
    ]);

    await service.transfer(userId, {
      fromAccountId: accountId,
      toAccountId: secondAccountId,
      amountMinor: '10000',
      occurredAt: new Date('2026-02-05'),
      description: 'Transfer',
    });

    const after = await Promise.all([
      accountsService.getById(userId, accountId),
      accountsService.getById(userId, secondAccountId),
    ]);
    expect(after[0].currentBalanceMinor).toBe(before[0].currentBalanceMinor - 10000n);
    expect(after[1].currentBalanceMinor).toBe(before[1].currentBalanceMinor + 10000n);
  });

  it('RG-T5: transfer legs are excluded from the expense/income summary', async () => {
    const summary = await service.summary(userId);
    const legs = await prisma.transaction.findMany({ where: { userId, transferGroupId: { not: null } } });
    expect(legs.length).toBeGreaterThan(0);
    // The 10000 transfer amount must not appear in either total.
    expect(summary.totalExpenseMinor).not.toBe('10000');
  });
});
