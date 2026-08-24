import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppError, ValidationAppError } from '../../../common/errors/app-error';
import { MailService } from '../../../common/mail/mail.service';
import { UsersFacade } from '../../users/users.facade';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { AuthService } from '../auth.service';
import { hashRefreshToken } from '../domain/refresh-token';

/** Minimal ConfigService double: reads real env values, overridable per test. */
function fakeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string | undefined> = { ...process.env, ...overrides };
  const coerce = (raw: string | undefined) => (raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : raw);
  return {
    get: (key: string) => coerce(values[key]),
    getOrThrow: (key: string) => {
      const value = coerce(values[key]);
      if (value === undefined) throw new Error(`fakeConfig: missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

/** Captures outgoing mail instead of hitting a real SMTP server during tests. */
class FakeMailService {
  sent: { to: string; subject: string; text: string }[] = [];
  async send(input: { to: string; subject: string; text: string }): Promise<void> {
    this.sent.push(input);
  }
}

describe('auth change-password flow', () => {
  const prisma = new PrismaService();
  const users = new UsersFacade(prisma);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const config = fakeConfig({ SMTP_HOST: '', WEB_APP_URL: 'https://app.test' });
  const mail = new FakeMailService();
  const service = new AuthService(prisma, users, categories, config, mail as unknown as MailService);

  const email = `change-pw-${Date.now()}@example.com`;
  const originalPassword = 'CorrectHorseBattery1';
  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const currency = await prisma.currency.findUnique({ where: { code: 'EUR' } });
    if (!currency) {
      throw new Error('EUR currency missing — run `npm run prisma:seed -w apps/api` first');
    }
    await service.register({ email, password: originalPassword, baseCurrency: 'EUR' });
    // Change-password is orthogonal to email verification - fast-forward it here so
    // login() below (which now rejects unverified accounts) isn't blocked.
    const created = await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    userId = created.id;
    mail.sent.length = 0;
  });

  afterAll(async () => {
    await prisma.emailVerificationToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  /** Sessions are keyed by refresh-token hash, which is how the caller's own session is identified. */
  function sessionFor(result: { refreshToken: string }) {
    return prisma.session.findFirst({ where: { userId, refreshTokenHash: hashRefreshToken(result.refreshToken) } });
  }

  it('rejects a weak new password', async () => {
    await expect(
      service.changePassword(userId, randomUUID(), {
        currentPassword: originalPassword,
        newPassword: 'short',
      }),
    ).rejects.toBeInstanceOf(ValidationAppError);
  });

  it('rejects a wrong current password', async () => {
    await expect(
      service.changePassword(userId, randomUUID(), {
        currentPassword: 'WrongCurrentPass1',
        newPassword: 'BrandNewStrongPass1',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  // 2 argon2 hashes + several round trips - slower than the default 5s under a loaded/remote DB.
  it('revokes every other session but keeps the caller\'s alive', async () => {
    const deviceA = await service.login({ email, password: originalPassword }, 'test-ip', 'vitest');
    const deviceB = await service.login({ email, password: originalPassword }, 'test-ip', 'vitest');
    const sessionA = await sessionFor(deviceA);
    const sessionB = await sessionFor(deviceB);
    expect(sessionA?.revokedAt).toBeNull();
    expect(sessionB?.revokedAt).toBeNull();

    const newPassword = 'BrandNewStrongPass1';
    await service.changePassword(userId, sessionA!.id, {
      currentPassword: originalPassword,
      newPassword,
    });

    expect((await sessionFor(deviceA))?.revokedAt).toBeNull();
    expect((await sessionFor(deviceB))?.revokedAt).not.toBeNull();

    // Device B's stolen-or-forgotten refresh token no longer mints access tokens.
    await expect(service.refresh(deviceB.refreshToken, 'test-ip-b', 'vitest')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });

    // Device A keeps working: its refresh token rotates to a fresh live session.
    const refreshedA = await service.refresh(deviceA.refreshToken, 'test-ip-a', 'vitest');
    expect(refreshedA.user.email).toBe(email);

    const successorA = await sessionFor(refreshedA);
    expect(successorA?.id).not.toBe(sessionA?.id);
    expect(successorA?.revokedAt).toBeNull();
  }, 15000);
});
