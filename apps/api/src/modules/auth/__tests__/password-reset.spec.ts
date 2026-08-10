import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppError, ValidationAppError } from '../../../common/errors/app-error';
import { MailService } from '../../../common/mail/mail.service';
import { UsersFacade } from '../../users/users.facade';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { AuthService } from '../auth.service';
import { generateRefreshToken, hashRefreshToken } from '../domain/refresh-token';

/** Minimal ConfigService double: reads real .env values, overridable per test. Never hits real SMTP. */
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

interface SentMail {
  to: string;
  subject: string;
  text: string;
}

/** Captures outgoing mail instead of hitting a real SMTP server during tests. */
class FakeMailService {
  sent: SentMail[] = [];
  async send(input: SentMail): Promise<void> {
    this.sent.push(input);
  }
}

function extractToken(text: string): string {
  const match = /token=([^\s]+)/.exec(text);
  if (!match) throw new Error('reset link token not found in email body');
  return match[1] as string;
}

describe('auth password reset flow', () => {
  const prisma = new PrismaService();
  const users = new UsersFacade(prisma);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const config = fakeConfig({ SMTP_HOST: '', WEB_APP_URL: 'https://app.test' });
  const mail = new FakeMailService();
  const service = new AuthService(prisma, users, categories, config, mail as unknown as MailService);

  const email = `reset-${Date.now()}@example.com`;
  const originalPassword = 'CorrectHorseBattery1';
  let userId: string;
  let consumedToken: string;

  beforeAll(async () => {
    await prisma.$connect();
    const currency = await prisma.currency.findUnique({ where: { code: 'EUR' } });
    if (!currency) {
      throw new Error('EUR currency missing — run `npm run prisma:seed -w apps/api` first');
    }
    await service.register({ email, password: originalPassword, baseCurrency: 'EUR' });
    // Password reset is orthogonal to email verification - fast-forward it here so
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

  it('does not send an email and does not throw for an unknown address (no account enumeration)', async () => {
    const before = mail.sent.length;
    await expect(service.forgotPassword('nobody-here@example.com')).resolves.toBeUndefined();
    expect(mail.sent.length).toBe(before);
  });

  it('sends a reset email with a working link for a known address', async () => {
    await service.forgotPassword(email);
    const last = mail.sent.at(-1);
    expect(last?.to).toBe(email);
    expect(last?.text).toContain('https://app.test/reset-password?token=');

    const stored = await prisma.passwordResetToken.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    expect(stored?.usedAt).toBeNull();
  });

  it('rejects a reset with a weak new password', async () => {
    const token = extractToken(mail.sent.at(-1)?.text as string);
    await expect(service.resetPassword({ token, newPassword: 'short' })).rejects.toBeInstanceOf(ValidationAppError);
  });

  it('rejects an unknown or garbage token', async () => {
    await expect(
      service.resetPassword({ token: 'not-a-real-token', newPassword: 'AnotherStrongPass1' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects an expired token', async () => {
    const expiredToken = generateRefreshToken();
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(expiredToken),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(
      service.resetPassword({ token: expiredToken, newPassword: 'AnotherStrongPass1' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  // 3 argon2 hashes + several round trips - slower than the default 5s under a loaded/remote DB.
  it('resets the password, revokes existing sessions, and consumes the token', async () => {
    const loginBefore = await service.login({ email, password: originalPassword }, 'test-ip', 'vitest');
    const activeSession = await prisma.session.findFirst({ where: { userId, revokedAt: null } });
    expect(activeSession).not.toBeNull();
    void loginBefore;

    consumedToken = extractToken(mail.sent.at(-1)?.text as string);
    const newPassword = 'BrandNewStrongPass1';
    await service.resetPassword({ token: consumedToken, newPassword });

    const revoked = await prisma.session.findMany({ where: { userId, revokedAt: null } });
    expect(revoked).toHaveLength(0);

    await expect(
      service.login({ email, password: originalPassword }, 'test-ip', 'vitest'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const relogin = await service.login({ email, password: newPassword }, 'test-ip', 'vitest');
    expect(relogin.user.email).toBe(email);
  }, 15000);

  it('rejects reusing an already-consumed token', async () => {
    await expect(
      service.resetPassword({ token: consumedToken, newPassword: 'YetAnotherStrongPass1' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
