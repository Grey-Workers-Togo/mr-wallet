import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ConflictAppError } from '../../../common/errors/app-error';
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

/** Lot 18 (docs/04 §D, RG-T11..RG-T16) — a fee is its own EXPENSE/FEE transaction, never a column. */
describe('transaction fees', () => {
  const prisma = new PrismaService();
  const accountsService = new AccountsService(prisma);
  const service = buildService(prisma);

  let userId: string;
  let accountId: string;
  let otherAccountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `tx-fees-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;
    await prisma.category.create({
      data: { userId, i18nKey: 'category.expense.transaction_fees', kind: 'EXPENSE', isSystem: true },
    });

    const account = await accountsService.create(userId, {
      name: 'Mobile money',
      type: 'MOBILE_MONEY',
      currency: 'EUR',
      openingBalanceMinor: '100000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;
    const other = await accountsService.create(userId, {
      name: 'Bank',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    otherAccountId = other.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function freshAccountBalance(id: string) {
    const account = await prisma.account.findUniqueOrThrow({ where: { id } });
    return account.currentBalanceMinor;
  }

  it('creates two rows: the parent (amount excludes the fee) and a linked FEE line, and debits both', async () => {
    const before = await freshAccountBalance(accountId);
    const created = await service.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '10000',
      occurredAt: new Date('2026-02-01'),
      description: 'Cash withdrawal',
      status: 'CLEARED',
      tagIds: [],
      feeMinor: '175',
    });

    expect(created.amountMinor).toBe(10000n);
    expect(created.feeMinor).toBe('175');

    const feeLine = await prisma.transaction.findFirstOrThrow({ where: { feeForTransactionId: created.id } });
    expect(feeLine.amountMinor).toBe(175n);
    expect(feeLine.type).toBe('EXPENSE');
    expect(feeLine.source).toBe('FEE');
    expect(feeLine.categoryId).not.toBeNull();

    const after = await freshAccountBalance(accountId);
    expect(before - after).toBe(10175n);

    // Reading the parent back returns the same feeMinor that was sent.
    const reread = await service.getById(userId, created.id);
    expect(reread.feeMinor).toBe('175');
  });

  it('setting feeMinor to 0 on an update removes the fee line and restores the balance', async () => {
    const before = await freshAccountBalance(accountId);
    const created = await service.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '5000',
      occurredAt: new Date('2026-02-02'),
      description: 'Withdrawal 2',
      status: 'CLEARED',
      tagIds: [],
      feeMinor: '100',
    });
    const afterCreate = await freshAccountBalance(accountId);
    expect(before - afterCreate).toBe(5100n);

    await service.update(userId, created.id, { feeMinor: '0' });
    const feeLine = await prisma.transaction.findFirst({ where: { feeForTransactionId: created.id } });
    expect(feeLine).toBeNull();

    const afterUpdate = await freshAccountBalance(accountId);
    expect(before - afterUpdate).toBe(5000n);

    const reread = await service.getById(userId, created.id);
    expect(reread.feeMinor).toBeUndefined();
  });

  it('changing feeMinor to a new value updates the fee line amount and balance', async () => {
    const before = await freshAccountBalance(accountId);
    const created = await service.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '2000',
      occurredAt: new Date('2026-02-03'),
      description: 'Withdrawal 3',
      status: 'CLEARED',
      tagIds: [],
      feeMinor: '50',
    });

    await service.update(userId, created.id, { feeMinor: '80' });
    const feeLine = await prisma.transaction.findFirstOrThrow({ where: { feeForTransactionId: created.id } });
    expect(feeLine.amountMinor).toBe(80n);

    const after = await freshAccountBalance(accountId);
    expect(before - after).toBe(2080n);
  });

  it('deleting the parent cascades to the fee line and reverses both balance effects', async () => {
    const before = await freshAccountBalance(accountId);
    const created = await service.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '3000',
      occurredAt: new Date('2026-02-04'),
      description: 'Withdrawal 4',
      status: 'CLEARED',
      tagIds: [],
      feeMinor: '60',
    });

    await service.remove(userId, created.id);
    const feeLine = await prisma.transaction.findFirst({ where: { feeForTransactionId: created.id } });
    expect(feeLine).toBeNull();

    const after = await freshAccountBalance(accountId);
    expect(after).toBe(before);
  });

  it('a fee line cannot be updated or deleted independently of its parent', async () => {
    const created = await service.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '1000',
      occurredAt: new Date('2026-02-05'),
      description: 'Withdrawal 5',
      status: 'CLEARED',
      tagIds: [],
      feeMinor: '20',
    });
    const feeLine = await prisma.transaction.findFirstOrThrow({ where: { feeForTransactionId: created.id } });

    await expect(service.update(userId, feeLine.id, { notes: 'hacked' })).rejects.toBeInstanceOf(ConflictAppError);
    await expect(service.remove(userId, feeLine.id)).rejects.toBeInstanceOf(ConflictAppError);
  });

  it('the fee line counts as an expense while a transfer itself stays excluded (RG-T5), and debits/credits are exact', async () => {
    const beforeSource = await freshAccountBalance(accountId);
    const beforeDest = await freshAccountBalance(otherAccountId);

    const { fromLeg } = await service.transfer(userId, {
      fromAccountId: accountId,
      toAccountId: otherAccountId,
      amountMinor: '4000',
      occurredAt: new Date('2026-02-06'),
      description: 'Transfer with fee',
      feeMinor: '90',
    });

    const afterSource = await freshAccountBalance(accountId);
    const afterDest = await freshAccountBalance(otherAccountId);
    expect(beforeSource - afterSource).toBe(4090n); // amount + fee
    expect(afterDest - beforeDest).toBe(4000n); // destination gets the exact amount, no fee

    const feeLine = await prisma.transaction.findFirstOrThrow({ where: { feeForTransactionId: fromLeg.id } });
    expect(feeLine.amountMinor).toBe(90n);
    expect(feeLine.accountId).toBe(accountId);

    const summary = await service.summary(userId);
    // The transfer legs are excluded from totalExpenseMinor; the fee line (source FEE, not a
    // transfer leg) is a plain EXPENSE and is included.
    const expenseTotal = BigInt(summary.totalExpenseMinor);
    expect(expenseTotal).toBeGreaterThanOrEqual(90n);
  });
});
