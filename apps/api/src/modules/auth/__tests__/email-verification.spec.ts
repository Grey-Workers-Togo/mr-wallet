import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppError } from '../../../common/errors/app-error';
import { MailService } from '../../../common/mail/mail.service';
import { UsersFacade } from '../../users/users.facade';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { AuthService } from '../auth.service';

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

class FakeMailService {
  sent: SentMail[] = [];
  async send(input: SentMail): Promise<void> {
    this.sent.push(input);
  }
}

function extractToken(text: string): string {
  const match = /token=([^\s]+)/.exec(text);
  if (!match) throw new Error('verify link token not found in email body');
  return match[1] as string;
}

describe('auth email verification flow', () => {
  const prisma = new PrismaService();
  const users = new UsersFacade(prisma);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const config = fakeConfig({ SMTP_HOST: '', WEB_APP_URL: 'https://app.test' });
  const mail = new FakeMailService();
  const service = new AuthService(prisma, users, categories, config, mail as unknown as MailService);

  const email = `verify-${Date.now()}@example.com`;
  const password = 'CorrectHorseBattery1';
  let userId: string;

  afterAll(async () => {
    await prisma.emailVerificationToken.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    await prisma.$connect();
    const currency = await prisma.currency.findUnique({ where: { code: 'EUR' } });
    if (!currency) {
      throw new Error('EUR currency missing — run `npm run prisma:seed -w apps/api` first');
    }
  });

  it('register does not issue a session and sends a verification email', async () => {
    const result = await service.register({ email, password, baseCurrency: 'EUR' });
    expect(result).toEqual({ email });

    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    userId = created.id;
    expect(created.emailVerifiedAt).toBeNull();

    const sent = mail.sent.at(-1);
    expect(sent?.to).toBe(email);
    expect(sent?.text).toContain('https://app.test/verify-email?token=');
  });

  it('login is rejected before the email is verified', async () => {
    await expect(service.login({ email, password }, 'test-ip', 'vitest')).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('rejects an unknown or garbage verification token', async () => {
    await expect(service.verifyEmail({ token: 'not-a-real-token' })).rejects.toBeInstanceOf(AppError);
  });

  it('resend is silent (no email, no throw) for an unknown address', async () => {
    const before = mail.sent.length;
    await expect(service.resendVerification({ email: 'nobody-here@example.com' })).resolves.toBeUndefined();
    expect(mail.sent.length).toBe(before);
  });

  it('verifying the email marks the account verified and logs the user in', async () => {
    const token = extractToken(mail.sent.at(-1)?.text as string);
    const result = await service.verifyEmail({ token });
    expect(result.user.email).toBe(email);
    expect(result.accessToken).toBeTruthy();

    const verified = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(verified.emailVerifiedAt).not.toBeNull();
  });

  it('rejects reusing an already-consumed verification token', async () => {
    const token = extractToken(mail.sent.at(-1)?.text as string);
    await expect(service.verifyEmail({ token })).rejects.toBeInstanceOf(AppError);
  });

  it('login now succeeds once the email is verified', async () => {
    const result = await service.login({ email, password }, 'test-ip', 'vitest');
    expect(result.user.email).toBe(email);
  });

  it('resend is a silent no-op for an already-verified account', async () => {
    const before = mail.sent.length;
    await service.resendVerification({ email });
    expect(mail.sent.length).toBe(before);
  });
});
