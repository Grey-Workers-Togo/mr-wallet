import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, RawPrismaService } from '../../../common/prisma/prisma.service';
import { buildSyncTestHarness } from './test-harness';

function uuidv7Like(): string {
  // Not a real UUIDv7 generator — just satisfies clientSuppliedId()'s version-nibble shape for tests.
  const id = randomUUID().split('-');
  id[2] = '7' + id[2]!.slice(1);
  return id.join('-');
}

/** Non-negotiable per endpoint (docs/10-conventions-dev.md § 6) — sync is no exception. */
describe('sync isolation (userId scoping)', () => {
  const prisma = new PrismaService();
  const raw = new RawPrismaService();
  const { syncService, accountsFacade } = buildSyncTestHarness(prisma, raw);

  let userA: string;
  let userB: string;
  let accountOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    await raw.$connect();
    const a = await prisma.user.create({
      data: { email: `sync-iso-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    const b = await prisma.user.create({
      data: { email: `sync-iso-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userA = a.id;
    userB = b.id;
    const account = await accountsFacade.create(userB, {
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
    await raw.$disconnect();
  });

  it('user A cannot create a transaction against user B account', async () => {
    const response = await syncService.push(userA, {
      deviceId: 'dev-a',
      platform: 'WEB',
      clientVersion: '1.0.0',
      operations: [
        {
          id: uuidv7Like(),
          op: 'transaction.create',
          clientTime: new Date().toISOString(),
          payload: {
            accountId: accountOfB,
            type: 'EXPENSE',
            amountMinor: '500',
            occurredAt: new Date().toISOString(),
            description: 'attempted cross-user write',
          },
        },
      ],
    });
    expect(response.results[0]?.status).toBe('rejected');
    expect(response.results[0]?.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it("user A cannot update user B's account (TARGET_GONE)", async () => {
    const response = await syncService.push(userA, {
      deviceId: 'dev-a',
      platform: 'WEB',
      clientVersion: '1.0.0',
      operations: [
        {
          id: uuidv7Like(),
          op: 'account.update',
          clientTime: new Date().toISOString(),
          payload: { id: accountOfB, name: 'hacked' },
        },
      ],
    });
    expect(response.results[0]?.status).toBe('conflict');
    expect(response.results[0]?.code).toBe('TARGET_GONE');
  });

  it("user B can operate on their own account", async () => {
    const response = await syncService.push(userB, {
      deviceId: 'dev-b',
      platform: 'WEB',
      clientVersion: '1.0.0',
      operations: [
        {
          id: uuidv7Like(),
          op: 'account.update',
          clientTime: new Date().toISOString(),
          payload: { id: accountOfB, name: 'renamed' },
        },
      ],
    });
    expect(response.results[0]?.status).toBe('applied');
  });
});
