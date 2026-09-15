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
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { ReconciliationService } from '../reconciliation.service';

function buildService(prisma: PrismaService, events: EventEmitter2) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const transactionsFacade = new TransactionsFacade(
    new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, events, new SavedSearchesService(prisma)),
  );
  return {
    service: new ReconciliationService(prisma, accountsFacade, transactionsFacade, categoriesFacade, events),
    accountsFacade,
    transactionsFacade,
  };
}

/** Lot 19 (docs/04 §B, RG-A8..RG-A14) — declared-balance reconciliation and the nightly drift check. */
describe('reconciliation', () => {
  const prisma = new PrismaService();
  const events = new EventEmitter2();
  const { service, accountsFacade, transactionsFacade } = buildService(prisma, events);

  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `reconcile-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;
    await prisma.category.create({
      data: { userId, i18nKey: 'category.expense.adjustment', kind: 'EXPENSE', isSystem: true },
    });

    const account = await accountsFacade.create(userId, {
      name: 'Cash wallet',
      type: 'CASH',
      currency: 'EUR',
      openingBalanceMinor: '10000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.balanceCheck.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('RG-A8/RG-A9: a lower declared balance creates one EXPENSE adjustment for exactly the difference', async () => {
    const result = await service.reconcile(userId, accountId, {
      actualBalanceMinor: '9000',
      asOfDate: new Date('2026-02-01'),
    });

    expect(result.deltaMinor).toBe('-1000');
    expect(result.transaction).not.toBeNull();
    expect(result.transaction?.amountMinor).toBe(1000n);
    expect(result.transaction?.type).toBe('EXPENSE');
    expect(result.transaction?.source).toBe('ADJUSTMENT');
    expect(result.transaction?.status).toBe('RECONCILED');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.currentBalanceMinor).toBe(9000n);
    expect(account.lastReconciledAt).not.toBeNull();
  }, 20_000);

  it('RG-A9: a higher declared balance creates an INCOME adjustment', async () => {
    const result = await service.reconcile(userId, accountId, {
      actualBalanceMinor: '9500',
      asOfDate: new Date('2026-02-02'),
    });

    expect(result.deltaMinor).toBe('500');
    expect(result.transaction?.type).toBe('INCOME');
    expect(result.transaction?.amountMinor).toBe(500n);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.currentBalanceMinor).toBe(9500n);
  });

  it('reconciling again with no activity in between creates nothing (docs/12 Lot 19 exit test)', async () => {
    const before = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

    const result = await service.reconcile(userId, accountId, {
      actualBalanceMinor: '9500',
      asOfDate: new Date('2026-02-03'),
    });

    expect(result.deltaMinor).toBe('0');
    expect(result.transaction).toBeNull();

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.currentBalanceMinor).toBe(before.currentBalanceMinor);
    // lastReconciledAt still advances — the user did perform the check, even with nothing to correct.
    expect(after.lastReconciledAt!.getTime()).toBeGreaterThan(before.lastReconciledAt!.getTime());
  });

  it('RG-A9: the adjustment is a normal transaction — editable and deletable like any other', async () => {
    const created = await service.reconcile(userId, accountId, {
      actualBalanceMinor: '9400',
      asOfDate: new Date('2026-02-04'),
    });
    const id = created.transaction!.id;

    const updated = await transactionsFacade.update(userId, id, { notes: 'checked against receipt' });
    expect(updated.notes).toBe('checked against receipt');

    await transactionsFacade.remove(userId, id);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    // Deleting the adjustment reverses its balance effect (RG-A3), same as any other transaction.
    expect(account.currentBalanceMinor).toBe(9500n);
  }, 20_000);

  it('isolation: user A cannot reconcile user B account', async () => {
    const other = await prisma.user.create({
      data: { email: `reconcile-other-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    await expect(
      service.reconcile(other.id, accountId, { actualBalanceMinor: '0', asOfDate: new Date() }),
    ).rejects.toBeInstanceOf(NotFoundAppError);
    await prisma.user.deleteMany({ where: { id: other.id } });
  });

  it('RG-A11: the nightly drift check only ever logs — it never books an adjustment', async () => {
    // Force a genuine mismatch: bump the stored balance directly, bypassing any transaction.
    await prisma.account.update({ where: { id: accountId }, data: { currentBalanceMinor: { increment: 777n } } });
    const transactionCountBefore = await prisma.transaction.count({ where: { userId } });

    let received: unknown = null;
    events.once('account.balance_mismatch', (payload) => {
      received = payload;
    });
    await service.runNightlyDriftChecks(userId);

    const transactionCountAfter = await prisma.transaction.count({ where: { userId } });
    expect(transactionCountAfter).toBe(transactionCountBefore);

    const check = await prisma.balanceCheck.findFirst({
      where: { userId, accountId },
      orderBy: { createdAt: 'desc' },
    });
    expect(check?.isMatch).toBe(false);
    expect(check?.deltaMinor).toBe(777n);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.balanceCheckedAt).not.toBeNull();
    expect(received).toMatchObject({ userId, accountId, accountName: 'Cash wallet' });

    // Revert the artificial mismatch so later assertions aren't affected by it.
    await prisma.account.update({ where: { id: accountId }, data: { currentBalanceMinor: { decrement: 777n } } });
  }, 20_000);

  it('the nightly drift check does not flag a matching account', async () => {
    let received = false;
    events.once('account.balance_mismatch', () => {
      received = true;
    });
    await service.runNightlyDriftChecks(userId);

    const check = await prisma.balanceCheck.findFirst({
      where: { userId, accountId },
      orderBy: { createdAt: 'desc' },
    });
    expect(check?.isMatch).toBe(true);
    expect(received).toBe(false);
  });
});
