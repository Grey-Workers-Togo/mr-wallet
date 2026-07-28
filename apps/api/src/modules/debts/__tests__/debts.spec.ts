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
import { DebtsService } from '../debts.service';

function buildDebtsService(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const events = new EventEmitter2();
  const transactionsService = new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, events);
  const transactionsFacade = new TransactionsFacade(transactionsService);
  return { service: new DebtsService(prisma, accountsFacade, transactionsFacade, events), accountsService: new AccountsService(prisma) };
}

describe('debts', () => {
  const prisma = new PrismaService();
  const { service, accountsService } = buildDebtsService(prisma);

  let userA: string;
  let userB: string;
  let accountId: string;
  let debtOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `debt-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    const b = await prisma.user.create({ data: { email: `debt-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userA = a.id;
    userB = b.id;

    const account = await accountsService.create(userB, {
      name: 'Main',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '1000000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;

    const debt = await service.create(userB, {
      name: 'Car loan',
      direction: 'OWED_BY_ME',
      kind: 'LOAN',
      linkedAccountId: accountId,
      principalMinor: '120000',
      currency: 'EUR',
      annualRatePct: 6,
      rateType: 'FIXED',
      compounding: 'MONTHLY',
      startedOn: new Date('2026-01-31'),
      termMonths: 6,
      paymentFrequency: 'MONTHLY',
    });
    debtOfB = debt.id;
  });

  afterAll(async () => {
    await prisma.debtPayment.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.debtInstallment.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.debt.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('user A cannot read user B debt', async () => {
    await expect(service.getById(userA, debtOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('RG-D1/RG-D2: schedule sums to principal and ends at zero balance', async () => {
    const schedule = await service.schedule(userB, debtOfB);
    expect(schedule).toHaveLength(6);
    const sumPrincipal = schedule.reduce((acc, i) => acc + i.principalMinor, 0n);
    expect(sumPrincipal).toBe(120000n);
    expect(schedule[5]?.balanceAfterMinor).toBe(0n);
  });

  it('RG-D6/RG-D9: a full installment payment marks it PAID and creates the linked transaction', async () => {
    const schedule = await service.schedule(userB, debtOfB);
    const first = schedule[0] as (typeof schedule)[number];

    const payment = await service.recordPayment(userB, debtOfB, {
      paidAt: new Date('2026-02-28'),
      amountMinor: first.totalMinor.toString(),
      installmentId: first.id,
      isExtraPayment: false,
    });

    expect(payment.transactionId).not.toBeNull();
    const updatedInstallment = await prisma.debtInstallment.findUnique({ where: { id: first.id } });
    expect(updatedInstallment?.status).toBe('PAID');

    const debt = await service.getById(userB, debtOfB);
    expect(debt.outstandingPrincipalMinor).toBe(120000n - first.principalMinor);

    const transaction = await prisma.transaction.findUnique({ where: { id: payment.transactionId as string } });
    expect(transaction?.source).toBe('DEBT_PAYMENT');
    expect(transaction?.type).toBe('EXPENSE');
  });

  it('RG-D9: deleting the payment reverses the installment and removes the linked transaction', async () => {
    const schedule = await service.schedule(userB, debtOfB);
    const first = schedule[0] as (typeof schedule)[number];
    const payments = await service.payments(userB, debtOfB);
    const payment = payments[0] as (typeof payments)[number];

    await service.removePayment(userB, debtOfB, payment.id);

    const revertedInstallment = await prisma.debtInstallment.findUnique({ where: { id: first.id } });
    expect(revertedInstallment?.status).toBe('SCHEDULED');
    expect(revertedInstallment?.paidMinor).toBe(0n);

    const debt = await service.getById(userB, debtOfB);
    expect(debt.outstandingPrincipalMinor).toBe(120000n);

    if (payment.transactionId) {
      const transaction = await prisma.transaction.findUnique({ where: { id: payment.transactionId } });
      expect(transaction?.deletedAt).not.toBeNull();
    }
  });

  it('RG-D4: an extra payment reduces principal directly and regenerates the remaining schedule', async () => {
    const before = await service.getById(userB, debtOfB);
    await service.recordPayment(userB, debtOfB, {
      paidAt: new Date('2026-03-01'),
      amountMinor: '50000',
      isExtraPayment: true,
    });

    const after = await service.getById(userB, debtOfB);
    expect(after.outstandingPrincipalMinor).toBe(before.outstandingPrincipalMinor - 50000n);

    const schedule = await service.schedule(userB, debtOfB);
    const scheduled = schedule.filter((i) => i.status === 'SCHEDULED');
    const sumPrincipal = scheduled.reduce((acc, i) => acc + i.principalMinor, 0n);
    expect(sumPrincipal).toBe(after.outstandingPrincipalMinor);
    expect(scheduled[scheduled.length - 1]?.balanceAfterMinor).toBe(0n);
  });

  it('RG-D8: paying off the remaining balance closes the debt', async () => {
    const debt = await service.getById(userB, debtOfB);
    await service.recordPayment(userB, debtOfB, {
      paidAt: new Date('2026-03-02'),
      amountMinor: debt.outstandingPrincipalMinor.toString(),
      isExtraPayment: true,
    });

    const closed = await service.getById(userB, debtOfB);
    expect(closed.status).toBe('PAID_OFF');
    expect(closed.outstandingPrincipalMinor).toBe(0n);
    expect(closed.closedAt).not.toBeNull();
  });
});
