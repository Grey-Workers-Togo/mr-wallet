import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../../common/errors/app-error';
import { CategoriesService } from '../categories.service';

describe('categories isolation (userId scoping)', () => {
  const prisma = new PrismaService();
  const service = new CategoriesService(prisma);

  let userA: string;
  let userB: string;
  let categoryOfB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({
      data: { email: `cat-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    const b = await prisma.user.create({
      data: { email: `cat-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userA = a.id;
    userB = b.id;

    const category = await service.create(userB, { name: "B's category", kind: 'EXPENSE' });
    categoryOfB = category.id;
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it('user A cannot read user B category by id', async () => {
    await expect(service.getById(userA, categoryOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it("user A's list never includes user B's categories", async () => {
    const list = await service.list(userA);
    expect(list.find((c) => c.id === categoryOfB)).toBeUndefined();
  });

  it('user A cannot update user B category', async () => {
    await expect(service.update(userA, categoryOfB, { name: 'hacked' })).rejects.toBeInstanceOf(NotFoundAppError);
  });

  it('user A cannot delete user B category', async () => {
    await expect(service.remove(userA, categoryOfB)).rejects.toBeInstanceOf(NotFoundAppError);
  });
});

describe('categories business rules', () => {
  const prisma = new PrismaService();
  const service = new CategoriesService(prisma);
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `cat-rules-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('RG-C1: rejects a third level of depth', async () => {
    const parent = await service.create(userId, { name: 'Parent', kind: 'EXPENSE' });
    const child = await service.create(userId, { name: 'Child', kind: 'EXPENSE', parentId: parent.id });
    await expect(service.create(userId, { name: 'Grandchild', kind: 'EXPENSE', parentId: child.id })).rejects.toThrow();
  });

  it('RG-C2: rejects a child whose kind differs from its parent', async () => {
    const parent = await service.create(userId, { name: 'Expenses root', kind: 'EXPENSE' });
    await expect(service.create(userId, { name: 'Income child', kind: 'INCOME', parentId: parent.id })).rejects.toThrow();
  });

  it('RG-C7: rejects a duplicate resolved name within the same parent', async () => {
    await service.create(userId, { name: 'Groceries', kind: 'EXPENSE' });
    await expect(service.create(userId, { name: 'Groceries', kind: 'EXPENSE' })).rejects.toThrow();
  });
});
