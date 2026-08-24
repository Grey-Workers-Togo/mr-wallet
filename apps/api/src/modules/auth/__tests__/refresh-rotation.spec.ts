import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Session } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppError } from '../../../common/errors/app-error';
import { MailService } from '../../../common/mail/mail.service';
import { UsersFacade } from '../../users/users.facade';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { AuthService, type AuthResult } from '../auth.service';
import { hashRefreshToken } from '../domain/refresh-token';

/** Mirrors REFRESH_REUSE_GRACE_MS in auth.service.ts - not exported, so restated here. */
const REUSE_GRACE_MS = 10_000;

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

describe('auth refresh token rotation', () => {
  const prisma = new PrismaService();
  const users = new UsersFacade(prisma);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const config = fakeConfig({ SMTP_HOST: '', WEB_APP_URL: 'https://app.test' });
  const mail = new FakeMailService();
  const service = new AuthService(prisma, users, categories, config, mail as unknown as MailService);

  const email = `refresh-${Date.now()}@example.com`;
  const password = 'CorrectHorseBattery1';
  let userId: string;

  /** Each login starts a fresh session family, keeping the tests below independent. */
  async function login(): Promise<AuthResult> {
    return service.login({ email, password }, 'test-ip', 'vitest');
  }

  async function requireSession(refreshToken: string) {
    const row = await prisma.session.findFirst({
      where: { userId, refreshTokenHash: hashRefreshToken(refreshToken) },
    });
    if (!row) throw new Error('session row not found for presented token');
    return row;
  }

  /** Walks one rotation family forward from its root token via successorId. */
  async function familyRows(rootToken: string) {
    const rows = [];
    let current: Session | null = await requireSession(rootToken);
    while (current) {
      rows.push(current);
      current = current.successorId
        ? await prisma.session.findUnique({ where: { id: current.successorId } })
        : null;
    }
    return rows;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const currency = await prisma.currency.findUnique({ where: { code: 'EUR' } });
    if (!currency) {
      throw new Error('EUR currency missing — run `npm run prisma:seed -w apps/api` first');
    }
    await service.register({ email, password, baseCurrency: 'EUR' });
    const created = await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    userId = created.id;
    mail.sent.length = 0;
  }, 15000);

  afterAll(async () => {
    await prisma.emailVerificationToken.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('rotates sequentially and the old token cannot spawn a second live session', async () => {
    const first = await login();
    const second = await service.refresh(first.refreshToken, 'test-ip', 'vitest');

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user.email).toBe(email);
    expect(second.skipCookie).toBeUndefined();

    const oldRow = await requireSession(first.refreshToken);
    expect(oldRow.supersededAt).not.toBeNull();
    if (!oldRow.successorId) throw new Error('rotation did not link a successor');
    const successor = await prisma.session.findUniqueOrThrow({ where: { id: oldRow.successorId } });
    expect(successor.revokedAt).toBeNull();

    const familyLive = () =>
      familyRows(first.refreshToken).then((rows) =>
        rows.filter((row) => row.revokedAt === null && row.supersededAt === null),
      );
    expect(await familyLive()).toHaveLength(1);

    // Replaying the old token resolves through the grace window without minting anything:
    // whatever it answers, the family must still hold exactly one live session.
    await service.refresh(first.refreshToken, 'test-ip', 'vitest');
    expect(await familyLive()).toHaveLength(1);
  }, 15000);

  it('reuse beyond the grace window revokes the whole family', async () => {
    const first = await login();
    await service.refresh(first.refreshToken, 'test-ip', 'vitest');

    const oldRow = await requireSession(first.refreshToken);
    await prisma.session.update({
      where: { id: oldRow.id },
      data: { supersededAt: new Date(Date.now() - REUSE_GRACE_MS - 1000) },
    });

    await expect(service.refresh(first.refreshToken, 'test-ip', 'vitest')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });

    const surviving = (await familyRows(first.refreshToken)).filter((row) => row.revokedAt === null);
    expect(surviving).toHaveLength(0);
  }, 15000);

  it('reuse within the grace window resolves to the successor without rewriting the cookie', async () => {
    const first = await login();
    const rotated = await service.refresh(first.refreshToken, 'test-ip', 'vitest');

    const replayed = await service.refresh(first.refreshToken, 'test-ip', 'vitest');

    expect(replayed.skipCookie).toBe(true);
    expect(replayed.refreshToken).toBe(first.refreshToken);
    expect(replayed.accessToken).toBeTruthy();
    expect(replayed.user.email).toBe(email);

    // No new session was minted by the replay: the family is unchanged.
    const rows = await familyRows(first.refreshToken);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.revokedAt === null && row.supersededAt === null)).toHaveLength(1);
    void rotated;
  }, 15000);

  it('two concurrent refreshes with the same token yield exactly one live successor', async () => {
    const first = await login();

    const settled = await Promise.allSettled([
      service.refresh(first.refreshToken, 'test-ip', 'vitest'),
      service.refresh(first.refreshToken, 'test-ip', 'vitest'),
    ]);

    // Each request settles cleanly: either a full result or an AppError - never a crash.
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        expect(outcome.reason).toBeInstanceOf(AppError);
      }
    }
    const fulfilled = settled.filter(
      (outcome): outcome is PromiseFulfilledResult<AuthResult> => outcome.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(2);

    // Exactly one full rotation; the loser resolved through the grace window.
    const winners = fulfilled.filter((outcome) => !outcome.value.skipCookie);
    const losers = fulfilled.filter((outcome) => outcome.value.skipCookie === true);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0]!.value.refreshToken).not.toBe(first.refreshToken);
    expect(losers[0]!.value.refreshToken).toBe(first.refreshToken);

    // No half states: the family holds the original plus a single live successor,
    // and the live row belongs to whichever token the winning request returned.
    const rows = await familyRows(first.refreshToken);
    expect(rows).toHaveLength(2);
    const live = rows.filter((row) => row.revokedAt === null && row.supersededAt === null);
    expect(live).toHaveLength(1);
    expect(live[0]!.refreshTokenHash).toBe(hashRefreshToken(winners[0]!.value.refreshToken));
  }, 15000);
});
