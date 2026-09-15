import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, RawPrismaService } from '../../../common/prisma/prisma.service';
import { buildSyncTestHarness } from './test-harness';

function uuidv7(): string {
  const id = randomUUID().split('-');
  id[2] = '7' + id[2]!.slice(1);
  return id.join('-');
}

/** docs/14-sync-protocol.md § 6 "Replay": same operation pushed N times, one entity, one effect. */
describe('sync replay (RG-SY2)', () => {
  const prisma = new PrismaService();
  const raw = new RawPrismaService();
  const { syncService } = buildSyncTestHarness(prisma, raw);

  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await raw.$connect();
    const user = await prisma.user.create({
      data: { email: `sync-replay-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('the same operation id pushed 3 times creates exactly one account', async () => {
    const opId = uuidv7();
    const request = {
      deviceId: 'dev-1',
      platform: 'WEB' as const,
      clientVersion: '1.0.0',
      operations: [
        {
          id: opId,
          op: 'account.create' as const,
          clientTime: new Date().toISOString(),
          payload: {
            name: 'Replay test account',
            type: 'CASH' as const,
            currency: 'EUR',
            openingBalanceMinor: '0',
            openingBalanceAt: new Date().toISOString(),
          },
        },
      ],
    };

    const first = await syncService.push(userId, request);
    expect(first.results[0]?.status).toBe('applied');

    const second = await syncService.push(userId, request);
    expect(second.results[0]?.status).toBe('duplicate');

    const third = await syncService.push(userId, request);
    expect(third.results[0]?.status).toBe('duplicate');

    const accounts = await prisma.account.findMany({ where: { userId, name: 'Replay test account' } });
    expect(accounts).toHaveLength(1);
  });
});
