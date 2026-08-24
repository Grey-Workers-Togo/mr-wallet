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

function buildServices(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const savedSearches = new SavedSearchesService(prisma);
  const transactions = new TransactionsService(
    prisma,
    accountsFacade,
    categoriesFacade,
    rulesFacade,
    new EventEmitter2(),
    savedSearches,
  );
  return { transactions, savedSearches };
}

describe('advanced multi-criteria search & saved searches', () => {
  const prisma = new PrismaService();
  const accountsService = new AccountsService(prisma);
  const categoriesService = new CategoriesService(prisma);
  const { transactions, savedSearches } = buildServices(prisma);

  let userId: string;
  let otherUserId: string;
  let accountId: string;
  let otherAccountId: string;
  let groceriesCategoryId: string;
  let travelTagId: string;
  let groceriesTxId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `search-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;
    const other = await prisma.user.create({
      data: { email: `search-other-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    otherUserId = other.id;

    const account = await accountsService.create(userId, {
      name: 'Main',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;

    const otherAccount = await accountsService.create(userId, {
      name: 'Savings',
      type: 'SAVINGS',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    otherAccountId = otherAccount.id;

    const category = await categoriesService.create(userId, { name: 'Groceries', kind: 'EXPENSE' });
    groceriesCategoryId = category.id;

    const tag = await prisma.tag.create({ data: { userId, name: 'Travel' } });
    travelTagId = tag.id;

    const groceriesTx = await transactions.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '2500',
      occurredAt: new Date('2026-03-05'),
      description: 'Weekly groceries',
      categoryId: groceriesCategoryId,
      payee: 'SuperMart',
      status: 'CLEARED',
      tagIds: [travelTagId],
    });
    groceriesTxId = groceriesTx.id;

    await transactions.create(userId, {
      accountId: otherAccountId,
      type: 'EXPENSE',
      amountMinor: '9000',
      occurredAt: new Date('2026-03-06'),
      description: 'Flight ticket',
      status: 'CLEARED',
      tagIds: [],
    });
  });

  afterAll(async () => {
    await prisma.savedSearch.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    const ownedTransactions = await prisma.transaction.findMany({
      where: { userId: { in: [userId, otherUserId] } },
      select: { id: true },
    });
    await prisma.transactionTag.deleteMany({ where: { transactionId: { in: ownedTransactions.map((t) => t.id) } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.tag.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  function fiveCriteriaFilter() {
    return {
      accountId: [accountId],
      categoryId: [groceriesCategoryId],
      tagId: [travelTagId],
      type: 'EXPENSE' as const,
      payee: 'SuperMart',
    };
  }

  it('applies 5 combined criteria (account, category, tag, type, payee) and matches only the transaction satisfying all of them', async () => {
    const page = await transactions.list(userId, { limit: 50, ...fiveCriteriaFilter() });
    expect(page.items.map((t) => t.id)).toEqual([groceriesTxId]);
  });

  it('a saved search with the same 5 criteria reproduces identical results to manual filtering', async () => {
    const saved = await savedSearches.create(userId, { name: 'Groceries by card', filter: fiveCriteriaFilter() });
    const manual = await transactions.list(userId, { limit: 50, ...fiveCriteriaFilter() });
    const viaSaved = await transactions.list(userId, { limit: 50, savedSearchId: saved.id });
    expect(viaSaved.items.map((t) => t.id)).toEqual(manual.items.map((t) => t.id));
  });

  it('deleting a saved search never touches the transactions it matched', async () => {
    const saved = await savedSearches.create(userId, { name: 'To delete', filter: fiveCriteriaFilter() });
    await savedSearches.remove(userId, saved.id);
    const stillThere = await transactions.getById(userId, groceriesTxId);
    expect(stillThere.id).toBe(groceriesTxId);
    await expect(savedSearches.getById(userId, saved.id)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('a deleted saved search no longer appears in the list', async () => {
    const saved = await savedSearches.create(userId, { name: 'Ephemeral', filter: {} });
    await savedSearches.remove(userId, saved.id);
    const list = await savedSearches.list(userId);
    expect(list.find((s: { id: string }) => s.id === saved.id)).toBeUndefined();
  });

  it('user A cannot read or apply user B saved search', async () => {
    const saved = await savedSearches.create(userId, { name: 'Private', filter: fiveCriteriaFilter() });
    await expect(savedSearches.getById(otherUserId, saved.id)).rejects.toBeInstanceOf(NotFoundAppError);
    await expect(transactions.list(otherUserId, { limit: 50, savedSearchId: saved.id })).rejects.toBeInstanceOf(
      NotFoundAppError,
    );
    const othersList = await savedSearches.list(otherUserId);
    expect(othersList.find((s: { id: string }) => s.id === saved.id)).toBeUndefined();
  });
});
