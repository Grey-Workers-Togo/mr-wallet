import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../audit-log.service';

describe('audit-log', () => {
  const prisma = new PrismaService();
  const service = new AuditLogService(prisma);

  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `audit-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    const b = await prisma.user.create({ data: { email: `audit-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userA = a.id;
    userB = b.id;

    await prisma.auditLog.create({
      data: { userId: userA, action: 'goal.create', entityType: 'SavingsGoal', entityId: 'g1', after: { name: 'Trip' } },
    });
    await prisma.auditLog.create({
      data: { userId: userB, action: 'goal.create', entityType: 'SavingsGoal', entityId: 'g2', after: { name: 'Other' } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('scopes list() to the authenticated user (isolation)', async () => {
    const rows = await service.list(userA);
    expect(rows.length).toBe(1);
    expect(rows[0]?.userId).toBe(userA);
  });

  it('does not leak another user entity history via forEntity()', async () => {
    const rows = await service.forEntity(userA, 'SavingsGoal', 'g2');
    expect(rows.length).toBe(0);
  });

  it('returns history for own entity in chronological order', async () => {
    const rows = await service.forEntity(userA, 'SavingsGoal', 'g1');
    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe('goal.create');
  });
});
