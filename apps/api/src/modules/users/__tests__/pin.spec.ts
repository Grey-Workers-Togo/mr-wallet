import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ValidationAppError } from '../../../common/errors/app-error';
import { UsersService } from '../users.service';

describe('users pin lock', () => {
  const prisma = new PrismaService();
  const service = new UsersService(prisma);

  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await prisma.$connect();
    const a = await prisma.user.create({ data: { email: `pin-a-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    const b = await prisma.user.create({ data: { email: `pin-b-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userA = a.id;
    userB = b.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects pin verification when none is set', async () => {
    await expect(service.verifyPin(userB, { pin: '1234' })).rejects.toBeInstanceOf(ValidationAppError);
  });

  it('sets, verifies, and removes a pin', async () => {
    await service.setPin(userA, { pin: '4242', lockMinutes: 10 });
    const profile = await service.getMe(userA);
    expect(profile.pinEnabled).toBe(true);
    expect(profile.pinLockMinutes).toBe(10);

    expect(await service.verifyPin(userA, { pin: '4242' })).toEqual({ valid: true });
    expect(await service.verifyPin(userA, { pin: '0000' })).toEqual({ valid: false });

    await service.removePin(userA);
    const after = await service.getMe(userA);
    expect(after.pinEnabled).toBe(false);
  });
});
