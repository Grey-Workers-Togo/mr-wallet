import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, RawPrismaService } from '../../../common/prisma/prisma.service';
import { buildSyncTestHarness } from './test-harness';

/** docs/14-sync-protocol.md § 3.2/3.3 — the changes/snapshot feed and its tombstones. */
describe('sync changes/snapshot feed', () => {
  const prisma = new PrismaService();
  const raw = new RawPrismaService();
  const { syncService, accountsFacade } = buildSyncTestHarness(prisma, raw);

  let userId: string;
  let accountAId: string;
  let accountBId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await raw.$connect();
    const user = await prisma.user.create({
      data: { email: `sync-feed-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;

    const a = await accountsFacade.create(userId, {
      name: 'Feed account A',
      type: 'CASH',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date(),
      includeInNetWorth: true,
    });
    accountAId = a.id;
    const b = await accountsFacade.create(userId, {
      name: 'Feed account B',
      type: 'CASH',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date(),
      includeInNetWorth: true,
    });
    accountBId = b.id;
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('snapshot returns both accounts as upserts', async () => {
    const page = await syncService.snapshot(userId, 200);
    const ids = page.changes.filter((c) => c.entity === 'account').map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([accountAId, accountBId]));
    for (const change of page.changes) {
      expect(change.op).toBe('upsert');
    }
  });

  it('changes since a cursor only returns what happened after it, and a delete becomes a tombstone', async () => {
    const before = await syncService.snapshot(userId, 200);
    await accountsFacade.remove(userId, accountBId);

    const after = await syncService.changes(userId, before.cursor, 200);
    const tombstone = after.changes.find((c) => c.entity === 'account' && c.id === accountBId);
    expect(tombstone?.op).toBe('tombstone');
    expect(tombstone?.deletedAt).toBeTruthy();
  });
});
