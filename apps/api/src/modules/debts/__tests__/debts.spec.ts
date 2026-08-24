import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotFoundAppError, ValidationAppError } from '../../../common/errors/app-error';
import { AccountsService } from '../../accounts/accounts.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { CategoriesService } from '../../categories/categories.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { RulesService } from '../../rules/rules.service';
import { RulesFacade } from '../../rules/rules.facade';
import { TransactionsService } from '../../transactions/transactions.service';
import { TransactionsFacade } from '../../transactions/transactions.facade';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { DebtsService } from '../debts.service';

function buildDebtsService(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const events = new EventEmitter2();
  const transactionsService = new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, events, new SavedSearchesService(prisma));
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
      termDays: 180,
      scheduleMode: 'AUTO',
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

  it('RG-D8: a paid-off debt leaves no SCHEDULED/LATE installment behind', async () => {
    const schedule = await service.schedule(userB, debtOfB);
    expect(schedule.filter((i) => i.status === 'SCHEDULED' || i.status === 'LATE')).toHaveLength(0);
    expect(schedule.some((i) => i.status === 'SKIPPED')).toBe(true);

    // The closed debt must not feed the forecast anymore (no fake future outflows, no late sweep).
    const upcoming = await service.upcomingInstallments(userB, new Date('2027-12-31'));
    expect(upcoming).toHaveLength(0);
  });

  it('RG-D8: deleting the payoff payment reactivates the debt and restores its skipped installments', async () => {
    const payments = await service.payments(userB, debtOfB);
    const payoff = payments.find((p) => p.isExtraPayment && p.installmentId === null) as (typeof payments)[number];

    await service.removePayment(userB, debtOfB, payoff.id);

    const debt = await service.getById(userB, debtOfB);
    expect(debt.status).toBe('ACTIVE');
    expect(debt.outstandingPrincipalMinor).toBeGreaterThan(0n);

    const schedule = await service.schedule(userB, debtOfB);
    expect(schedule.some((i) => i.status === 'SKIPPED')).toBe(false);
    expect(schedule.some((i) => i.status === 'SCHEDULED' || i.status === 'LATE')).toBe(true);
  });

  describe('manual schedule mode', () => {
    let manualDebtId: string;

    beforeAll(async () => {
      const debt = await service.create(userB, {
        name: 'Informal loan to a friend',
        direction: 'OWED_TO_ME',
        kind: 'INFORMAL',
        principalMinor: '50000',
        currency: 'EUR',
        rateType: 'ZERO',
        compounding: 'MONTHLY',
        startedOn: new Date('2026-01-01'),
        scheduleMode: 'MANUAL',
        manualInstallments: [
          { dueOn: new Date('2026-01-10'), totalMinor: '10000' },
          { dueOn: new Date('2026-01-20'), totalMinor: '15000' },
          { dueOn: new Date('2026-02-01'), totalMinor: '25000' },
        ],
        paymentFrequency: 'MONTHLY',
      });
      manualDebtId = debt.id;
    });

    it('persists the hand-typed installments as-is', async () => {
      const schedule = await service.schedule(userB, manualDebtId);
      expect(schedule.map((i) => i.totalMinor)).toEqual([10000n, 15000n, 25000n]);
      expect(schedule.every((i) => i.interestMinor === 0n)).toBe(true);
      expect(schedule[schedule.length - 1]?.balanceAfterMinor).toBe(0n);
    });

    it('user A cannot read user B manual debt', async () => {
      await expect(service.getById(userA, manualDebtId)).rejects.toBeInstanceOf(NotFoundAppError);
    });

    it('rejects schedule regeneration for a manual debt', async () => {
      await expect(service.regenerateSchedule(userB, manualDebtId, { strategy: 'REDUCE_TERM' })).rejects.toBeInstanceOf(
        ValidationAppError,
      );
    });

    it('rejects payoff simulation for a manual debt', async () => {
      await expect(service.simulatePayoff(userB, manualDebtId, { extraPaymentMinor: '1000' })).rejects.toBeInstanceOf(
        ValidationAppError,
      );
    });

    it('an extra payment reduces principal but leaves future manual installments untouched', async () => {
      const before = await service.schedule(userB, manualDebtId);
      await service.recordPayment(userB, manualDebtId, {
        paidAt: new Date('2026-01-05'),
        amountMinor: '5000',
        isExtraPayment: true,
      });

      const debt = await service.getById(userB, manualDebtId);
      expect(debt.outstandingPrincipalMinor).toBe(45000n);

      const after = await service.schedule(userB, manualDebtId);
      expect(after.map((i) => i.totalMinor)).toEqual(before.map((i) => i.totalMinor));
      expect(after.map((i) => i.dueOn)).toEqual(before.map((i) => i.dueOn));
    });
  });
});
