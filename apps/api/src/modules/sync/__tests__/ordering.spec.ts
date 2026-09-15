import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, RawPrismaService } from '../../../common/prisma/prisma.service';
import { buildSyncTestHarness } from './test-harness';

function uuidv7(): string {
  const id = randomUUID().split('-');
  id[2] = '7' + id[2]!.slice(1);
  return id.join('-');
}

/**
 * docs/14-sync-protocol.md § 6 "Ordering": a batch is processed strictly sequentially (RG-SY9),
 * so an operation may reference an entity created earlier in the SAME batch.
 */
describe('sync ordering (sequential processing)', () => {
  const prisma = new PrismaService();
  const raw = new RawPrismaService();
  const { syncService } = buildSyncTestHarness(prisma, raw);

  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await raw.$connect();
    const user = await prisma.user.create({
      data: { email: `sync-order-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('a transaction.create in the same batch as its account.create resolves', async () => {
    const accountId = uuidv7();
    const response = await syncService.push(userId, {
      deviceId: 'dev-1',
      platform: 'WEB',
      clientVersion: '1.0.0',
      operations: [
        {
          id: accountId,
          op: 'account.create',
          clientTime: new Date().toISOString(),
          payload: {
            id: accountId,
            name: 'Fresh-in-batch account',
            type: 'CASH',
            currency: 'EUR',
            openingBalanceMinor: '0',
            openingBalanceAt: new Date().toISOString(),
          },
        },
        {
          id: uuidv7(),
          op: 'transaction.create',
          clientTime: new Date().toISOString(),
          payload: {
            accountId,
            type: 'EXPENSE',
            amountMinor: '1500',
            occurredAt: new Date().toISOString(),
            description: 'Same-batch dependency',
          },
        },
      ],
    });

    expect(response.results[0]?.status).toBe('applied');
    expect(response.results[1]?.status).toBe('applied');
    expect(response.stoppedAt).toBeNull();

    const account = await prisma.account.findFirstOrThrow({ where: { id: accountId, userId } });
    expect(account.currentBalanceMinor).toBe(-1500n);
  });
});
