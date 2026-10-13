import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AssistantDataVersionService } from '../assistant-data-version.service';
import { AssistantUsageService } from '../assistant-usage.service';
import { buildLive, cleanup, seedDataset, type Dataset, type Live } from './live-harness';

describe('AssistantUsageService (RG-AQ1–AQ3, RG-AP3)', () => {
  const prisma = new PrismaService();
  const usage = new AssistantUsageService(prisma);
  const now = new Date('2031-03-15T10:00:00Z'); // a month nothing else writes to
  const users: string[] = [];

  async function user(tag: string): Promise<string> {
    const created = await prisma.user.create({
      data: { email: `usage-${tag}-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'XOF' },
    });
    users.push(created.id);
    return created.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.assistantUsage.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('takes questions from the daily quota and refuses the one past the limit', async () => {
    const userId = await user('quota');
    expect(await usage.reserve(userId, now, 2)).toBe(true);
    expect(await usage.reserve(userId, now, 2)).toBe(true);
    expect(await usage.reserve(userId, now, 2)).toBe(false);
    expect(await usage.requestsToday(userId, now)).toBe(2);
  });

  it('never lets concurrent requests take more than the quota', async () => {
    const userId = await user('race');
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => usage.reserve(userId, now, 3)));
    expect(outcomes.filter(Boolean)).toHaveLength(3);
    expect(await usage.requestsToday(userId, now)).toBe(3);
  });

  it('starts a fresh quota on the next UTC day', async () => {
    const userId = await user('day');
    expect(await usage.reserve(userId, now, 1)).toBe(true);
    expect(await usage.reserve(userId, now, 1)).toBe(false);
    expect(await usage.reserve(userId, new Date('2031-03-16T00:00:01Z'), 1)).toBe(true);
  });

  it('keeps one user quota apart from another', async () => {
    const [first, second] = [await user('iso-a'), await user('iso-b')];
    expect(await usage.reserve(first, now, 1)).toBe(true);
    expect(await usage.reserve(second, now, 1)).toBe(true);
  });

  it('gives a unit back on release, never below zero', async () => {
    const userId = await user('release');
    await usage.reserve(userId, now, 5);
    await usage.release(userId, now);
    await usage.release(userId, now);
    expect(await usage.requestsToday(userId, now)).toBe(0);
  });

  it('accumulates tokens and cost, and sums the cost of the month across users', async () => {
    const [first, second] = [await user('cost-a'), await user('cost-b')];
    const before = await usage.monthCostMicros(now);
    for (const userId of [first, second]) {
      await usage.reserve(userId, now, 5);
      await usage.record(userId, now, { inputTokens: 100, outputTokens: 20, costMicros: 1_500n });
    }
    await usage.record(first, now, { inputTokens: 50, outputTokens: 5, costMicros: 500n });

    expect(await usage.monthCostMicros(now)).toBe(before + 3_500n);
    const row = await prisma.assistantUsage.findFirstOrThrow({ where: { userId: first } });
    expect(row).toMatchObject({ inputTokens: 150, outputTokens: 25, estimatedCostMicros: 2_000n });
  });

  it('counts a month from its first UTC day only', async () => {
    const userId = await user('month');
    await usage.reserve(userId, new Date('2031-04-02T10:00:00Z'), 5);
    await usage.record(userId, new Date('2031-04-02T10:00:00Z'), { inputTokens: 1, outputTokens: 1, costMicros: 9_000_000n });
    const marchBefore = await usage.monthCostMicros(now);
    const aprilBefore = await usage.monthCostMicros(new Date('2031-04-20T00:00:00Z'));
    await usage.record(userId, new Date('2031-04-02T10:00:00Z'), { inputTokens: 0, outputTokens: 0, costMicros: 1n });
    // The April row moves April and leaves March alone.
    expect(await usage.monthCostMicros(now)).toBe(marchBefore);
    expect(await usage.monthCostMicros(new Date('2031-04-20T00:00:00Z'))).toBe(aprilBefore + 1n);
    expect(aprilBefore).toBeGreaterThanOrEqual(9_000_000n);
  });

  it('stores counters and nothing else (RG-AP3)', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'AssistantUsage' ORDER BY column_name`;
    expect(columns.map((column) => column.column_name)).toEqual([
      'createdAt',
      'day',
      'estimatedCostMicros',
      'inputTokens',
      'outputTokens',
      'requests',
      'updatedAt',
      'userId',
    ]);
  });
});

describe('AssistantDataVersionService (ADR-0022 §3)', () => {
  const prisma = new PrismaService();
  let live: Live;
  let version: AssistantDataVersionService;
  let a: Dataset;
  let b: Dataset;

  beforeAll(async () => {
    await prisma.$connect();
    live = buildLive(prisma);
    version = new AssistantDataVersionService(prisma);
    a = await seedDataset(prisma, live, 'ver-a', 1n);
    b = await seedDataset(prisma, live, 'ver-b', 1n);
  });

  afterAll(async () => {
    await cleanup(prisma, [a.userId, b.userId]);
    await prisma.$disconnect();
  });

  it('is stable while nothing is written', async () => {
    expect(await version.current(a.userId)).toBe(await version.current(a.userId));
  });

  it('moves when the user writes a transaction', async () => {
    const before = await version.current(a.userId);
    await live.transactionsService.create(a.userId, {
      accountId: a.accountId,
      type: 'EXPENSE',
      amountMinor: '100',
      occurredAt: new Date('2026-09-20T10:00:00Z'),
      description: 'x',
      status: 'CLEARED',
      tagIds: [],
    });
    expect(await version.current(a.userId)).not.toBe(before);
  });

  it('moves again, forward, when a transaction is soft-deleted (never back to an older value)', async () => {
    const created = await live.transactionsService.create(a.userId, {
      accountId: a.accountId,
      type: 'EXPENSE',
      amountMinor: '100',
      occurredAt: new Date('2026-09-21T10:00:00Z'),
      description: 'to delete',
      status: 'CLEARED',
      tagIds: [],
    });
    const afterCreate = await version.current(a.userId);
    await prisma.transaction.deleteMany({ where: { id: created.id } });
    const afterDelete = await version.current(a.userId);
    expect(afterDelete > afterCreate).toBe(true);
  });

  it('does not move for a write by another user', async () => {
    const before = await version.current(a.userId);
    await live.transactionsService.create(b.userId, {
      accountId: b.accountId,
      type: 'EXPENSE',
      amountMinor: '100',
      occurredAt: new Date('2026-09-22T10:00:00Z'),
      description: 'x',
      status: 'CLEARED',
      tagIds: [],
    });
    expect(await version.current(a.userId)).toBe(before);
  });
});
