import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../../common/errors/app-error';
import { AccountsService } from '../accounts.service';

/**
 * Non-negotiable test (docs/10-conventions-dev.md §6): user A must get a 404-equivalent
 * on user B's resource, on every endpoint. Runs against the real dev database.
 */
describe('accounts isolation (userId scoping)', () => {
  const prisma = new PrismaService();
  const service = new AccountsService(prisma);

  let userA: string;
  let userB: string;
  let accountOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const currency = await prisma.currency.findUnique({ where: { code: 'EUR' } });
    if (!currency) {
      throw new Error('EUR currency missing — run `npm run prisma:seed -w apps/api` first');
    }

    const a = await prisma.user.create({
      data: { email: `test-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    const b = await prisma.user.create({
      data: { email: `test-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userA = a.id;
    userB = b.id;

    const account = await service.create(userB, {
      name: "B's account",
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '10000',
      openingBalanceAt: new Date(),
      includeInNetWorth: true,
    });
    accountOfB = account.id;
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('user A cannot read user B account by id', async () => {
    await expect(service.getById(userA, accountOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it("user A's list never includes user B's accounts", async () => {
    const list = await service.list(userA, true);
    expect(list.find((a) => a.id === accountOfB)).toBeUndefined();
  });

  it('user A cannot update user B account', async () => {
    await expect(service.update(userA, accountOfB, { name: 'hacked' })).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('user A cannot delete user B account', async () => {
    await expect(service.remove(userA, accountOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('user A cannot archive user B account', async () => {
    await expect(service.archive(userA, accountOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('user B can read their own account', async () => {
    const account = await service.getById(userB, accountOfB);
    expect(account.id).toBe(accountOfB);
  });
});
