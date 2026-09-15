import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppError } from '../../../common/errors/app-error';
import { MailService } from '../../../common/mail/mail.service';
import { UsersFacade } from '../../users/users.facade';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { AuthService } from '../auth.service';
import { generateRefreshToken, hashRefreshToken } from '../domain/refresh-token';
import { OAuthProfile, OAuthProviderAdapter } from '../../../common/oauth/oauth-provider.interface';

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

class FakeMailService {
  async send(): Promise<void> {}
}

class FakeOAuthProviderAdapter implements OAuthProviderAdapter {
  constructor(private readonly profile: OAuthProfile) {}
  buildAuthUrl(): string {
    return 'https://example.test/authorize';
  }
  async exchangeCode(): Promise<OAuthProfile> {
    return this.profile;
  }
}

function withFakeProfile(service: AuthService, profile: OAuthProfile): void {
  (service as unknown as { getOAuthProviderAdapter: () => OAuthProviderAdapter }).getOAuthProviderAdapter = () =>
    new FakeOAuthProviderAdapter(profile);
}

describe('auth OAuth brand-new signup (pending -> complete)', () => {
  const prisma = new PrismaService();
  const users = new UsersFacade(prisma);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const config = fakeConfig();
  const service = new AuthService(prisma, users, categories, config, new FakeMailService() as unknown as MailService);

  const runId = Date.now();
  const email = `oauth-pending-${runId}@example.com`;
  const pid = (suffix: string) => `google-pending-${runId}-${suffix}`;
  const userIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const currency = await prisma.currency.findUnique({ where: { code: 'EUR' } });
    if (!currency) {
      throw new Error('EUR currency missing — run `npm run prisma:seed -w apps/api` first');
    }
  });

  afterAll(async () => {
    await prisma.pendingOAuthSignup.deleteMany({ where: { email } });
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('a brand-new identity creates no User row yet, only a pending signup token', async () => {
    withFakeProfile(service, { providerAccountId: pid('1'), email, emailVerified: true, name: 'New Person' });

    const outcome = await service.handleOAuthCallback('GOOGLE', 'code', 'test-ip', 'vitest');
    expect(outcome.kind).toBe('pending');
    expect(await users.findByEmail(email)).toBeNull();

    if (outcome.kind !== 'pending') throw new Error('expected pending outcome');
    const pending = await prisma.pendingOAuthSignup.findUnique({
      where: { tokenHash: hashRefreshToken(outcome.redirectToken) },
    });
    expect(pending).toMatchObject({ provider: 'GOOGLE', providerAccountId: pid('1'), email, usedAt: null });
  });

  it(
    'completing it creates the User (no password, provider-verified), links the account, and logs in',
    async () => {
      withFakeProfile(service, { providerAccountId: pid('2'), email: `${email}.2`, emailVerified: true, name: 'New Person 2' });
      const pendingOutcome = await service.handleOAuthCallback('GOOGLE', 'code', 'test-ip', 'vitest');
      if (pendingOutcome.kind !== 'pending') throw new Error('expected pending outcome, got: ' + JSON.stringify(pendingOutcome));

      const result = await service.completeOAuthSignup(
        { token: pendingOutcome.redirectToken, baseCurrency: 'EUR' },
        'test-ip',
        'vitest',
      );
      expect(result.user.email).toBe(`${email}.2`);
      expect(result.accessToken).toBeTruthy();
      userIds.push(result.user.id);

      const created = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
      expect(created.passwordHash).toBeNull();
      expect(created.emailVerifiedAt).not.toBeNull();
      expect(created.baseCurrency).toBe('EUR');

      const link = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: pid('2') } },
      });
      expect(link?.userId).toBe(result.user.id);

      const pending = await prisma.pendingOAuthSignup.findUnique({
        where: { tokenHash: hashRefreshToken(pendingOutcome.redirectToken) },
      });
      expect(pending?.usedAt).not.toBeNull();
    },
    // completeOAuthSignup does ~6 sequential round trips against the remote dev DB — comfortably
    // under the default 5s locally, but occasionally not over a slower connection.
    15_000,
  );

  it(
    'rejects reusing an already-consumed pending signup token',
    async () => {
      withFakeProfile(service, { providerAccountId: pid('3'), email: `${email}.3`, emailVerified: true, name: null });
      const pendingOutcome = await service.handleOAuthCallback('GOOGLE', 'code', 'test-ip', 'vitest');
      if (pendingOutcome.kind !== 'pending') throw new Error('expected pending outcome');

      const first = await service.completeOAuthSignup({ token: pendingOutcome.redirectToken, baseCurrency: 'EUR' }, 'test-ip', 'vitest');
      userIds.push(first.user.id);

      await expect(
        service.completeOAuthSignup({ token: pendingOutcome.redirectToken, baseCurrency: 'EUR' }, 'test-ip', 'vitest'),
      ).rejects.toMatchObject({ code: 'INVALID_OAUTH_SIGNUP_TOKEN' });
    },
    15_000,
  );

  it('rejects an expired pending signup token', async () => {
    const token = generateRefreshToken();
    await prisma.pendingOAuthSignup.create({
      data: {
        tokenHash: hashRefreshToken(token),
        provider: 'GOOGLE',
        providerAccountId: pid('expired'),
        email: `${email}.expired`,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(
      service.completeOAuthSignup({ token, baseCurrency: 'EUR' }, 'test-ip', 'vitest'),
    ).rejects.toBeInstanceOf(AppError);
    expect(await users.findByEmail(`${email}.expired`)).toBeNull();
  });

  it('rejects an unknown base currency and creates no User', async () => {
    withFakeProfile(service, { providerAccountId: pid('4'), email: `${email}.4`, emailVerified: true, name: null });
    const pendingOutcome = await service.handleOAuthCallback('GOOGLE', 'code', 'test-ip', 'vitest');
    if (pendingOutcome.kind !== 'pending') throw new Error('expected pending outcome');

    await expect(
      service.completeOAuthSignup({ token: pendingOutcome.redirectToken, baseCurrency: 'ZZZ' }, 'test-ip', 'vitest'),
    ).rejects.toMatchObject({ code: 'CURRENCY_UNKNOWN' });
    expect(await users.findByEmail(`${email}.4`)).toBeNull();
  });
});
