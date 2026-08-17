import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UsersService } from '../users.service';

describe('users profile', () => {
  const prisma = new PrismaService();
  const service = new UsersService(prisma);

  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `profile-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    const b = await prisma.user.create({ data: { email: `profile-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userA = a.id;
    userB = b.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('defaults hasSeenOnboarding to false', async () => {
    const profile = await service.getMe(userA);
    expect(profile.hasSeenOnboarding).toBe(false);
  });

  it('persists hasSeenOnboarding through updateMe and round-trips via getMe', async () => {
    const updated = await service.updateMe(userA, { hasSeenOnboarding: true });
    expect(updated.hasSeenOnboarding).toBe(true);

    const profile = await service.getMe(userA);
    expect(profile.hasSeenOnboarding).toBe(true);
  });

  it('does not leak hasSeenOnboarding across users', async () => {
    const profileB = await service.getMe(userB);
    expect(profileB.hasSeenOnboarding).toBe(false);
  });
});
