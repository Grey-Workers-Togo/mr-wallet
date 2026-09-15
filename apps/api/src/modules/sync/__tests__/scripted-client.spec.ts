import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OperationEnvelope } from '@budget-manager/sync-protocol';
import { PrismaService, RawPrismaService } from '../../../common/prisma/prisma.service';
import { buildSyncTestHarness } from './test-harness';

function uuidv7(): string {
  // Test-only stand-in: a real v4 with the version nibble forced to 7, satisfying
  // clientSuppliedId()'s shape check without pulling in a real UUIDv7 library for tests.
  const id = randomUUID().split('-');
  id[2] = '7' + id[2]!.slice(1);
  return id.join('-');
}

/**
 * M0 exit criterion (docs/15-roadmap-mobile.md § M0): "a scripted client pushes 200 operations,
 * is interrupted at 20 random points, resumes, and produces exactly 200 entities with balances
 * equal to an independent recomputation."
 *
 * "Interrupted and resumes" is simulated by pushing in small, randomly-sized batches and
 * re-sending the previous batch's last operation at the start of the next one each time — a
 * client that isn't sure its last request landed re-submits it, which must be a no-op (RG-SY2).
 */
describe('sync scripted client — interruption and resume (M0 exit criterion)', () => {
  const prisma = new PrismaService();
  const raw = new RawPrismaService();
  const { syncService } = buildSyncTestHarness(prisma, raw);

  let userId: string;
  const NUM_ACCOUNTS = 5;
  const NUM_TRANSACTIONS = 195; // + NUM_ACCOUNTS = 200 operations total

  beforeAll(async () => {
    await prisma.$connect();
    await raw.$connect();
    const user = await prisma.user.create({
      data: { email: `sync-scripted-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
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

  it('produces exactly 200 entities with balances equal to an independent recomputation', async () => {
    const accountIds = Array.from({ length: NUM_ACCOUNTS }, () => uuidv7());
    const operations: OperationEnvelope[] = accountIds.map((id) => ({
      id,
      op: 'account.create',
      clientTime: new Date().toISOString(),
      payload: {
        id,
        name: `Scripted account ${id.slice(0, 8)}`,
        type: 'CASH',
        currency: 'EUR',
        openingBalanceMinor: '0',
        openingBalanceAt: new Date().toISOString(),
      },
    }));

    for (let i = 0; i < NUM_TRANSACTIONS; i++) {
      const accountId = accountIds[i % NUM_ACCOUNTS]!;
      const type = i % 3 === 0 ? 'INCOME' : 'EXPENSE';
      const amountMinor = String(100 + ((i * 37) % 5000));
      operations.push({
        id: uuidv7(),
        op: 'transaction.create',
        clientTime: new Date().toISOString(),
        payload: {
          accountId,
          type,
          amountMinor,
          occurredAt: new Date().toISOString(),
          description: `Scripted transaction ${i}`,
        },
      });
    }

    expect(operations).toHaveLength(NUM_ACCOUNTS + NUM_TRANSACTIONS);

    // Interruption simulation: random chunk sizes (5-15), ~20 pushes for 200 ops. Re-send the
    // previous chunk's last op at the head of the next push every time.
    let cursor = 0;
    let carryOver: OperationEnvelope | null = null;
    let interruptionPoints = 0;
    while (cursor < operations.length) {
      const chunkSize = 5 + Math.floor(Math.random() * 11); // 5..15
      const chunk = operations.slice(cursor, cursor + chunkSize);
      cursor += chunk.length;
      const batch = carryOver ? [carryOver, ...chunk] : chunk;
      carryOver = chunk[chunk.length - 1] ?? carryOver;
      interruptionPoints++;

      const response = await syncService.push(userId, {
        deviceId: 'scripted-device',
        platform: 'WEB',
        clientVersion: '1.0.0',
        operations: batch,
      });
      expect(response.stoppedAt).toBeNull();
      for (const result of response.results) {
        expect(['applied', 'duplicate']).toContain(result.status);
      }
    }
    expect(interruptionPoints).toBeGreaterThanOrEqual(14); // sanity: genuinely split into many pushes

    const accounts = await prisma.account.findMany({ where: { userId } });
    const transactions = await prisma.transaction.findMany({ where: { userId } });
    expect(accounts).toHaveLength(NUM_ACCOUNTS);
    expect(transactions).toHaveLength(NUM_TRANSACTIONS);

    // Independent recomputation, not a reuse of AccountsService.reconcile() — a fresh SQL rollup.
    for (const account of accounts) {
      const own = transactions.filter((t) => t.accountId === account.id);
      const income = own.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountMinor, 0n);
      const expense = own.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountMinor, 0n);
      const computed = account.openingBalanceMinor + income - expense;
      expect(account.currentBalanceMinor).toBe(computed);
    }
  }, 500_000);
});
